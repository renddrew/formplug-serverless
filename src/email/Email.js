const { isEmail } = require("validator");
const InternalServerError = require("../error/InternalServerError");

class Email {
  constructor(sender, senderArn, subject, recipients, params) {

    this.Source = this._source(sender, senderArn);

    // set replyto from email user param
    if (params.email) {
      this.ReplyToAddresses = [params.email];
    } else {
      this.ReplyToAddresses = recipients.replyTo
    }

    this.Destination = {
      ToAddresses: [recipients.to],
      CcAddresses: recipients.cc,
      BccAddresses: recipients.bcc,
    };
    this.Message = {
      Subject: {
        Data: subject,
      },
      Body: {
        Text: {
          Data: this._messageBody(params),
        },
      },
    };
  }

  validate() {
    const sourceEmail = this.Source.match(/<(.)+>/gi);

    if (!sourceEmail || sourceEmail.length === 0) {
      return new InternalServerError(
        "Source should contain a valid email address"
      );
    }

    if (!this.Message.Subject.Data || this.Message.Subject.Data.length === 0) {
      return new InternalServerError("Subject is invalid");
    }

    if (
      !this.Message.Body.Text.Data ||
      this.Message.Body.Text.Data.length === 0
    ) {
      return new InternalServerError("Body is invalid");
    }

    const invalidReplyToEmail = this.ReplyToAddresses.find((e) => !isEmail(e));

    if (invalidReplyToEmail) {
      return new InternalServerError(
        `Invalid reply to recipient: ${invalidReplyToEmail}`
      );
    }

    const invalidToEmail = this.Destination.ToAddresses.find(
      (e) => !isEmail(e)
    );

    if (invalidToEmail) {
      return new InternalServerError(`Invalid to recipient: ${invalidToEmail}`);
    }

    const invalidCcEmail = this.Destination.CcAddresses.find(
      (e) => !isEmail(e)
    );

    if (invalidCcEmail) {
      return new InternalServerError(`Invalid cc recipient: ${invalidCcEmail}`);
    }

    const invalidBccEmail = this.Destination.BccAddresses.find(
      (e) => !isEmail(e)
    );

    if (invalidBccEmail) {
      return new InternalServerError(
        `Invalid bcc recipient: ${invalidBccEmail}`
      );
    }
  }

  _source(sender, senderArn) {
    const senderArnAsArray = (senderArn ?? "").split("/");
    const email = senderArnAsArray[senderArnAsArray.length - 1];
    return `${sender} <${email}>`;
  }

  _messageBody(requestBody) {
    return Object.keys(requestBody ?? {})
      .filter(function (param) {
        // don't send private variables
        return param.substring(0, 1) !== "_" && param.toLowerCase().indexOf('recaptcha') === -1;
      })
      .reduce(function (message, param) {
        // uppercase the field names and add each parameter value
        message += param.toUpperCase() + ": " + requestBody[param] + "\r\n";
        return message;
      }, "");
  }
}

module.exports = Email;
