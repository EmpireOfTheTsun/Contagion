class Message{
  constructor(payload, status){
    this.payload = payload;
    this.status = status;
    console.log("Message Made");
  }
}
//Required for Node.js, try/catch suppresses error on frontend.
try{
  module.exports = Message;
}
catch(err){}
