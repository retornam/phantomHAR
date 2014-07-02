var child_process = require('child_process');
var spawn = child_process.spawn;

var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var Promise = require('es6-promise').Promise;


try {
  var settings = require('./settings_local');
} catch (e) {
  var settings = require('./settings');
}


app.use(bodyParser.urlencoded());  // To support URL-encoded (not JSON-encoded) bodies.


// CORS support.
app.all('*', function (req, res, next) {
  if (!req.get('Origin')) {
    return next();
  }
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS, PATCH, POST, PUT');
  res.set('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type');
  if (req.method === 'OPTIONS') {
    return res.send(200);
  }
  next();
});

function phantomHAR(opts) {
  return new Promise(function (resolve, reject) {
    var output = '';
    var error = '';

    var args = [__dirname + '/phantomhar.js', opts.url];
    if (typeof opts.delay !== 'undefined') {
      args.push(opts.delay);
    }
    var env = {
      PATH: process.env.PATH + ':' + __dirname
    };

    // TODO: Try again using `xvfb`.
    // TODO: Allow SlimerJS to be swapped out with PhantomJS since the script
    // runs with both.
    var job = spawn(__dirname + '/lib/packages/slimerjs/slimerjs', args, env);

    job.stdout.on('data', function (data) {
      output += data.toString();
    });

    job.stderr.on('data', function (data) {
      error += data.toString();
    });

    job.on('exit', function (code) {
      // Replace everything before the JSON (e.g., potentially slimerjs notices).
      output = output.substr(output.indexOf('{'));

      // console.log('phantomjs output:', output);
      // console.error('phantomjs error:', error);

      if (code !== 0) {
        if (error) {
          error = 'stderr: ' + error;
        } else {
          error = 'phantomjs ' + args[0] + ' exited: ' + code;
        }
        console.error(error);
        reject(error);
      }

      resolve(output);
    });
  });
}

app.get('/har', har);
app.post('/har', har);

function har(req, res) {
  var DATA = req.body;

  if (!Object.keys(req.body).length) {
    // Use querystring parameters for `GET`s instead.
    DATA = req.query;
  }

  if (settings.DEBUG) {
    console.log('[' + new Date() + '] ' + req.method + ' ' + req.url + ' ' + JSON.stringify(DATA));
  }

  var url = encodeURIComponent(DATA.url);
  var delay = DATA.delay;
  var ref = DATA.ref || new Date().toISOString();
  var payload = DATA.payload;
  var sha = null;
  var repoUrl = null;

  if (payload) {
    try {
      payload = JSON.parse(payload);
    } catch(e) {
    }
    if (payload && payload.after &&
        payload.repository && payload.repository.url) {
      sha = payload.after;
      repoUrl = payload.repository.url;
    }
  }

  setTimeout(function() {
    phantomHAR({url: DATA.url, delay: 0}).then(function (data) {
      data = JSON.parse(data);
      data.log._ref = ref;
      data.log._sha = sha;
      data.log._repo = repoUrl;

      // TODO: Fix sizes.

      res.json(data);
    }, function (err) {
      return res.error(400, {error: err});
    });
  }, DATA.delay || 0);
}

var port = process.env.PORT || settings.PORT || 9000;

var server = app.listen(port, function (url) {
  var address = server.address();
  console.log('Server listening at http://%s:%s', address.address, address.port);
});