// # Request Handler
//
// ## Filter Chain
//
// This request handler expects filters in a chain with function signatures (req, res, next)
// 
(exports = module.exports = function(house){
    // Filters are required from the config
    //
    if(!house.config.hasOwnProperty('filters')) {
        throw new Error("Filters are required from config");
    }
    
    //
    // ## Request Filters
    //
    var requestFilters = require('./filters')(house);
    
    //
    // ### Welcome HTTP Request! 
    //
    // Our request handler passes the request and response object through our filters
    //
    var reqHandler = function(req, res) {
        req.urlOrig = req.url;
        var x = 0;
        var getNextFilter = function(){ var f = requestFilters[x]; x++; return f; }
        var nextFilter = function() {
            if(requestFilters.length > x) {
                var nextFilterFn = getNextFilter();
                if(nextFilterFn) {
                    nextFilterFn(req, res, nextFilter);
                }
            }
        };
        nextFilter();
    };
    
    return reqHandler;
});