// Express Setup
var express = require('express');
var app = express();

// body-parser Setup
var bodyParser = require('body-parser');

// multer Setup
var multer = require('multer');

// Socket.io Setup
// TODO: Finish Socket.io setup

// async setup


// http Setup
var http = require('http');

// moment Setup
var moment = require('moment');


// NeDB Setup
//var Datastore = require('nedb');
//db = new Datastore({filename: "db/app.db", autoload: true});

// Request ID (for session tracking purposes)
var sessionID = 0;

// FreeSWITCH ESL Setup
var fs = {
	host: "127.0.0.1",
	port: 8021,
	pass: "ClueCon"
}

var modesl = require('modesl');
var eslConnect = true;
var eslConnected = false;
if (eslConnect) {
	var eslConnection = new modesl.Connection('127.0.0.1', 8021, 'ClueCon', function(res) {
		log(2, "Connected to FreeSWITCH");
		eslConnected = true;
	});
}

// Log Function
var log = function(severity, message, id) {
	var severityText = "";
	switch(severity) {
		case 0:
			severityText = "ERR";
			break;
		case 1:
			severityText = "WARN";
			break;
		case 2:
			severityText = "INFO";
			break;
		case 3:
			severityText = "DEBUG";
			break;
		default:
			severityText = "INFO";
			severity = 2;
	}
	
	if (id) {
		console.log("[" + moment().format() + "][" + severityText + "][" + id + "]: " + message);
	} else {
		console.log("[" + moment().format() + "][" + severityText + "]: " + message);
	}
}




// Use body-parser and multer on incoming requests to parse body
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(multer()); // for parsing multipart/form-data

app.use(function(req, res, next) {
	sessionID = sessionID + 1;
	req.session = {"id": sessionID};
	log(3, req.method + " " + req.url + " " + req.path, req.session.id);
	next();
});

// Express Routes

// Do on all requests
//app.use(function(req, res, next) {
	//if (req.body.key) {
		//req.key = req.body.key;
	//} else if (req.query.key) {
		//req.key = req.query.key;
	//}
	
	//if (req.key) {
		//log(3, "Authenticating Key: " + req.key, req.session.id);
		//db.findOne({_id: req.key}, function(err, doc) {
			//if (err) {
				//log(1, "Datastore error: " + err, req.session.id);
			//} else {
				//if (doc.user.id && doc.user.pass && doc.user.domain) {
					//log(2, "Authenticated Key for this request.");
					//req.user = doc.user;
					//req.user.authenticated = true;
				//}
			//}
		//}
	//} else {
		//log(2, "Cannot authenticate Key, no Key exists in request.", req.session.id);
	//}
//}



app.use(function(req, res, next) {
	if (req.body.user && req.body.domain && req.body.pass) {
		req.user = {"id": req.body.user, "domain": req.body.domain, "pass": req.body.pass};
	} else if (req.query.user && req.query.domain && req.query.pass) {
		req.user = {"id": req.query.user, "domain": req.query.domain, "pass": req.query.pass};
	}
		
	if (req.user) {
		log(3, "Authenticating user " + req.user.id + " to FreeSWITCH domain " + req.user.domain + "...", req.session.id);
		
		var conn = new modesl.Connection(fs.host, fs.port, fs.pass, function() {
			conn.api('vm_fsdb_auth_login', 'default ' + req.user.domain + ' ' + req.user.id + ' ' + req.user.pass, function(response) {
				log(3, 'Response from FreeSWITCH: ' + JSON.stringify(response), req.session.id);
				
				
				if (response.body == "-OK") {				
					log(3, "Authenticated user to FreeSWITCH", req.session.id);
					req.user.authenticated = true;
					next();
				} else {
					log(3, "Authentication failed", req.session.id);
					req.user.authenticated = false;
					res.status(401)
					next();
				}
				
			});
		});	
	} else {
		log(3, "Request cannot be authenticated.", req.session.id);
		req.user = {"authenticated": false};
		res.status(407);
		next();
	}
});

app.get('/login', function(req, res, next) {
	
	
	next();
});

app.get('/message/list/:list', function(req, res, next) {
	if (req.user.authenticated) {
		log(3, "Getting " + req.params.list + " message list for: " + req.user.id + "@" + req.user.domain, req.session.id);
		var msgList = [];
		
		
		var conn = new modesl.Connection(fs.host, fs.port, fs.pass, function() {
			conn.api('vm_fsdb_msg_list', 'json default ' + req.user.domain + ' ' + req.user.id + ' inbox ' + req.params.list, function(eslResponse) {
				log(3, 'Response from FreeSWITCH: ' + eslResponse.body, req.session.id);
				
				var body = JSON.parse(eslResponse.body);
				
				log(2, "FreeSWITCH says user has " + body['VM-List-Count'] + " messages.", req.session.id);
				
				if (body['VM-List-Count'] > 0) {
					log(3, "We have messages to parse!", req.session.id);
					for (i = 0; i < body['VM-List-Count']; i++) {
						msgList[(i)] = body['VM-List-Message-' + (i + 1) + '-UUID'];
					}
					log(3, "Message List: " + msgList , req.session.id);
					
					res.status(200).jsonp(msgList);	
				}
			});
		});
		
	} else {
		log(3, "Cannot do sync for unauthenticated user.", req.session.id);
		next();
	}
});

// Get Message Detail from FreeSWITCH
app.get('/message/:uuid', function(req, res, next) {
	if (req.user.authenticated) {
		log(3, "Getting detail for message: " + req.params.uuid, req.session.id);
		var msg = [];
		

		var conn = new modesl.Connection(fs.host, fs.port, fs.pass, function() {
			conn.api('vm_fsdb_msg_get', 'json default ' + req.user.domain + ' ' + req.user.id + ' ' + req.params.uuid, function(eslResponse) {
				log(3, "Response from Freeswitch: " + eslResponse.body, req.session.id);
				
				var body = JSON.parse(eslResponse.body);
				msg[0] = {};
				msg[0]['uuid'] = body['VM-Message-UUID'];
				msg[0]['received_epoch'] = body['VM-Message-Received-Epoch'];
				msg[0]['caller_id_number'] = body['VM-Message-Caller-Number'];
				msg[0]['caller_id_name'] = body['VM-Message-Caller-Name'];
				msg[0]['duration_seconds'] = body['VM-Message-Duration'];
				msg[0]['read_epoch'] = body['VM-Message-Read-Epoch'];
				
				if (body['VM-Message-Flags'] == 'save') {
					msg[0]['tags'] = 'saved';
				} else {
					msg[0]['tags'] = 'new';
				}
				
				log(3, "Message " + msg[0]['uuid'] + " Detail: " + JSON.stringify(msg), req.session.id);
				res.status(200).jsonp(msg);
			});
		});
	} else {
		log(3, "Cannot get message detail for unauthenticated user.", req.session.id);
		next();
	}
	
});

// Do at end of all requests
app.use(function(req, res) {
	switch(res.statusCode) {
		case 200:
			log(3, "Returned Status: 200 OK", req.session.id);
			break;
		case 407:
			log(3, "Returned Status: 407 Proxy Authentication Required", req.session.id);
			res.end("407 Proxy Authentication Required");
			break;
		case 401:
			log(3, "Returned Status: 401 Unauthorized", req.session.id);
			res.end("401 Unauthorized");
			break;
		default:
			log(3, "Unknown Status, not acting on status code: " + res.statusCode, req.session.id);
			res.end();
	}
});

// Initialize HTTP Server
app.server = http.createServer(app);
app.server.listen(3000);
log(3, "Server listening on port 3000.");
