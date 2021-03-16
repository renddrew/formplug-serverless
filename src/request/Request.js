const querystring = require("querystring");

const ForbiddenError = require("../error/ForbiddenError");
const UnprocessableEntityError = require("../error/UnprocessableEntityError");
const BadRequestError = require("../error/BadRequestError");

const encryption = require("../lib/encryption");
const validation = require("../lib/validation");

const SINGLE_EMAIL_FIELDS = ["_to"];
const DELIMETERED_EMAIL_FIELDS = ["_cc", "_bcc", "_replyTo"];

class Request {
  constructor(event, encryptionKey) {
    this.userParameters = querystring.parse(event.body);
    this.recipients = this._buildRecipients(this.userParameters, encryptionKey);
    this.responseFormat = this._buildResponseFormat(
      event.queryStringParameters
    );
    this.redirectUrl = this._buildRedirectUrl(this.userParameters);
    this.recaptcha = this._buildRecaptcha(this.userParameters);
    this.sourceIp = this._buildSourceIp(event.requestContext);
  }

  validate(whitelistedRecipients) {
    if (
      "_honeypot" in this.userParameters &&
      this.userParameters._honeypot !== ""
    ) {
      return new ForbiddenError();
    }

    if (this.responseFormat !== "json" && this.responseFormat !== "html") {
      return new UnprocessableEntityError(
        "Invalid response format in the query string"
      );
    }

    if (this.recipients.to === "") {
      return new UnprocessableEntityError("Invalid '_to' recipient");
    }

    for (const field of SINGLE_EMAIL_FIELDS) {
      if (field in this.userParameters) {
        const email = this.recipients[field.substring(1)].toLowerCase();

        if (!validation.isEmail(email)) {
          return new UnprocessableEntityError(
            `Invalid email in '${field}' field`
          );
        }

        if (whitelistedRecipients && !whitelistedRecipients.includes(email)) {
          return new UnprocessableEntityError(
            `Non-whitelisted email in '${field}' field`
          );
        }
      }
    }

    for (const field of DELIMETERED_EMAIL_FIELDS) {
      if (field in this.userParameters) {
        const emails = this.recipients[field.substring(1)].map((e) =>
          e.toLowerCase()
        );

        if (emails.some((e) => !validation.isEmail(e))) {
          return new UnprocessableEntityError(
            `Invalid email in '${field}' field`
          );
        }

        if (
          whitelistedRecipients &&
          emails.some((e) => !whitelistedRecipients.includes(e))
        ) {
          return new UnprocessableEntityError(
            `Non-whitelisted email in '${field}' field`
          );
        }
      }
    }

    if (this.redirectUrl && !validation.isWebsite(this.redirectUrl)) {
      return new UnprocessableEntityError("Invalid website URL in '_redirect'");
    }

    const customParameters = Object.keys(this.userParameters).filter(
      (param) => {
        return param.substring(0, 1) !== "_" && param.toLowerCase().indexOf('recaptcha') === -1;
      }
    );

    if (customParameters.length < 1) {
      return new UnprocessableEntityError(`Expected at least one custom field`);
    }

    if (!this.sourceIp) {
      return new BadRequestError("Expected request to include source ip");
    }
  }

  isJsonResponse() {
    return this.responseFormat === "json";
  }

  isRedirectResponse() {
    return this.redirectUrl != null;
  }

  _buildRecipients(userParameters, encryptionKey) {
    const recipients = {
      to: "",
      cc: [],
      bcc: [],
      replyTo: [],
    };

    SINGLE_EMAIL_FIELDS.forEach((field) => {
      if (field in userParameters) {
        const potentialEmail = userParameters[field];

        if (validation.isEmail(potentialEmail)) {
          recipients[field.substring(1)] = potentialEmail;
        } else {
          const decryptedPotentialEmail = encryption.decrypt(
            potentialEmail,
            encryptionKey
          );
          recipients[field.substring(1)] = decryptedPotentialEmail;
        }
      }
    });

    DELIMETERED_EMAIL_FIELDS.forEach((field) => {
      if (field in userParameters) {
        const potentialEmails = userParameters[field].split(";");

        potentialEmails.forEach((potentialEmail) => {
          if (validation.isEmail(potentialEmail)) {
            recipients[field.substring(1)].push(potentialEmail);
          } else {
            const decryptedPotentialEmail = encryption.decrypt(
              potentialEmail,
              encryptionKey
            );
            recipients[field.substring(1)].push(decryptedPotentialEmail);
          }
        });
      }
    });

    return recipients;
  }

  _buildResponseFormat(params) {
    if (params && "format" in params) {
      return params.format;
    } else {
      return "html";
    }
  }

  _buildRedirectUrl(params) {
    if (params && "_redirect" in params) {
      return params["_redirect"];
    }
  }

  _buildRecaptcha(params) {
    if (params && params["g-recaptcha-response"]) {
      return params["g-recaptcha-response"];
    }
    if (params && params["_recaptcha"]) {
      return params["_recaptcha"];
    }
  }

  _buildSourceIp(requestContext) {
    if (
      requestContext &&
      requestContext.identity &&
      requestContext.identity.sourceIp
    ) {
      return requestContext.identity.sourceIp;
    }
  }
}

module.exports = Request;
