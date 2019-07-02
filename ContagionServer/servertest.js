console.log("Server starting!");

//need nodeJS and uuid on the server
//Use v4 as it is random and therefore hard to predict
//If we want user accounts, perhaps v3 or v5 would be better, as it produces reliable values based on names.
//Cookies are a potential route for tracking players, but rather not, since legal issues.
const uuidv4 = require('uuid/v4');
const WebSocketServer = require('ws').Server;
var http = require("http");
var express = require("express");
var nodemailer = require('nodemailer');
var app=express();
app.get('/',function(req,res)
{
res.send('Hello Borld!');
});
var server=app.listen(3000,function() {});
console.log(app);
