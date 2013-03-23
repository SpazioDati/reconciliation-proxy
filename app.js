var express = require('express')
  , request = require('request')
  , NodeCache = require('node-cache')
  , async = require('async')
  , cache = new NodeCache()
  , ttl = 30
  , app = express();

app.use(express.bodyParser());
app.use(express.logger("dev"));

var process_url = function (url, key) {
  return function (callback) {
    cache.get(url, function (e, value) {
      var result;
      if (value[url]) {
        result = value[url];
        result.key = key;
        callback(null, result);
      }
      else {
        request(url, function (error, response, body) {
          var code = response ? response.statusCode : 400
            , result = {body: body, statusCode: code, key: key};
          cache.set(url, result, ttl);
          callback(null, result);
        });
      }
    });
  }
};

var output_format = function (body) {
  obj = {
    result: [{
      id: body,
      name: body,
      match: true,
      score: 100,
      type: [{
        id: '/',
        name: 'Basic service',
      }]
    }]
  };
  return obj;
};

var process_query = function (query, res) {
  var functions = [];
  if (typeof(query) === 'string') {
    functions.push(process_url(query));
  }
  else if (typeof(query) === 'object') {
    for (var key in query) {
      var url = query[key].query || query[key];
      functions.push(process_url(url, key));
    }
  }

  async.parallel(functions, function (err, results) {
    if (!err) {
      if (results.length === 1) {
        if (results[0].statusCode >= 200 && results[0].statusCode <= 299) {
          res.jsonp(output_format(results[0].body));
        }
        else {
          res.jsonp({'result': []});
        }
      }
      else {
        var obj = {};
        for (var i=0; i<results.length; i++) {
          current = results[i];
          if (current.statusCode >= 200 && current.statusCode <= 299) {
            obj[current.key] = output_format(current.body);
          }
          else {
            obj[current.key] = {result: []};
          }
        }
        res.jsonp(obj);
      }
    }
  })
};

app.all('/reconcile', function(req, res) {
  var query = req.param("query")
    , queries = req.param("queries")
    , url;

  if (query) {
    try {
      url = JSON.parse(query).query;
    }
    catch (e) {
      url = query;
    }
    process_query(url, res);
  }
  else if (queries) {
    process_query(JSON.parse(queries), res);
  }
  else
    res.jsonp({
      name: "Reconciliation-Proxy",
      defaultTypes: []
    });
});

app.listen(8000);
