exports = module.exports.config = {
    version: 0.001,
    routes: [ {
        analytics: {
            "static": {
                send: {
                    publicFolder: __dirname + "/../web"
                    , otherwise: 'index.html'
                }
            }
        }
    } ]
};
