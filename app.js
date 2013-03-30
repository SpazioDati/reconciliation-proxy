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
  };
};

var output_format = function (body) {
  return {
    result: [{
      id: body,
      name: body.substring(0, 255),
      match: true,
      score: 100,
      type: [{
        id: '/',
        name: 'Basic service',
      }]
    }]
  };
};

var process_query = function (query, res, single_query) {
  var functions = [];

  if (typeof(query) === 'string') {
    functions.push(process_url(query));
  }
  else if (typeof(query) === 'object') {
    Object.keys(query).forEach(function (k) {
      var url = query[k].query || query[k];
      functions.push(process_url(url, k));
    });
  }

  async.parallel(functions, function (err, results) {
    if (err)
      return;

    if (single_query) {
      if (results[0].statusCode >= 200 && results[0].statusCode <= 299) {
        res.jsonp(output_format(results[0].body));
      }
      else {
        res.jsonp({'result': []});
      }
    }
    else {
      var obj = {};
      results.forEach(function (el) {
        if (el.statusCode >= 200 && el.statusCode <= 299) {
          obj[el.key] = output_format(el.body);
        }
        else {
          obj[el.key] = {result: []};
        }
      });
      res.jsonp(obj);
    }
  });
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
    process_query(url, res, true);
  }
  else if (queries) {
    process_query(JSON.parse(queries), res, false);
  }
  else
    res.jsonp({
      name: "Reconciliation-Proxy",
      defaultTypes: []
    });
});

app.listen(process.env.RECONCILIATION_PROXY_PORT || 8080, 'localhost');
