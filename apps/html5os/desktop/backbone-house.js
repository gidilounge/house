var apiPathPrefix = (window.hasOwnProperty('config')) ? config.apiPrefix : '/api';
Backbone.House = {};
Backbone.House.Model = Backbone.Model.extend({
    views: {},
    initialize: function() {
    },
    next: function() {
        return this.collection.next(this);
    },
    prev: function() {
        return this.collection.prev(this);
    },
    getOwner: function(callback) {
        if (this.has('owner')) {
            var owner = this.get('owner');
            var user = window.usersCollection.getOrFetch(owner.id, callback);
        }
    },
    getUser: function(callback) {
        if (this.has('user')) {
            var user = this.get('user');
            var user = window.usersCollection.getOrFetch(user.id, callback);
        }
    },
    getFullView: function(options) {
        options = options || {};
        options.model = this;
        if (!this.full) {
            var view = this.full = new this.FullView(options);
            this.views.full = view;
        }
        return this.full;
    },
    getAvatarView: function(options) {
        options = options || {};
        options.model = this;
        if (!this.avatar) {
            var view = this.avatar = new this.AvatarView(options);
            this.views.avatar = view;
        }
        return this.avatar;
    },
    getRow: function(options) {
        return this.getRowView(options);
    },
    getRowView: function(options) {
        options = options || {};
        options.model = this;
        if (!this.row) {
            var view = this.row = new this.RowView(options);
            this.views.row = view;
        }
        return this.row;
    },
    getTableRowView: function(options) {
        options = options || {};
        options.model = this;
        if (!this.trow) {
            var view = this.trow = new this.TableRowView(options);
            this.views.trow = view;
        }
        return this.trow;
    },
    renderViews: function() {
        for (var i in this.views) {
            this.views[i].render();
        }
    },
    getNavigatePath: function() {
        return 'id/' + this.id;
    },
    getAtFormatted: function(format) {
        if(!format) {
            format = "YYYY-MM-DDTHH:mm:ssZZ"
        }
        return this.getAt().format(format);
    },
    getAt: function() {
        if(!this.atMoment) {
            var at = this.get('at');
            if(window.clock) {
                this.atMoment = clock.moment(this.get('at'));
            }
        }
        // $permalink.find('time').attr('datetime', m.format("YYYY-MM-DDTHH:mm:ssZZ"));
        // $at.attr('title', m.format('LLLL'));
        // $permalink.find('time').html(m.calendar());
        return this.atMoment;
    }
});
Backbone.House.Collection = Backbone.Collection.extend({
    initialize: function(models, options) {
        var self = this;
        self.pageSize = 25;
        this.resetFilters();
        require(['/desktop/socket.io.min.js'], function() {
            var socketOpts = {};
            if (window.location.protocol.indexOf('https') !== -1) {
                socketOpts.secure = true;
            } else {
                socketOpts.secure = false;
            }
            var socket = self.io = io.connect('//' + window.location.host + '/socket.io/io', socketOpts);
            if (socket.socket.connected) {
                console.log('already connected and now joining ' + self.collectionName);
                socket.emit('join', self.collectionName);
            }
            socket.on('connect', function(data) {
                console.log('connected and now joining ' + self.collectionName);
                socket.emit('join', self.collectionName);
            });
            var insertOrUpdateDoc = function(doc) {
                console.log(doc);
                if (_.isArray(doc)) {
                    _.each(doc, insertOrUpdateDoc);
                    return;
                    s
                }
                var model = self.get(doc.id);
                if (!model) {
                    var model = new self.model(doc);
                    self.add(model);
                } else {
                    console.log('update model with doc')
                    model.set(doc, {
                        silent: true
                    });
                    model.renderViews();
                }
            }
            var collectionNameCap = self.collectionName[0].toUpperCase()+self.collectionName.substr(1);
            socket.on('inserted'+collectionNameCap, function(doc) {
                insertOrUpdateDoc(doc);
                self.count++;
                self.trigger('count', self.count);
            });
            socket.on('updated'+collectionNameCap, function(doc) {
                insertOrUpdateDoc(doc);
            });
            socket.on('deleted'+collectionNameCap, function(id) {
                self.remove(id);
                self.count--;
                self.trigger('count', self.count);
            });
    
            self.initialized = true;
            self.trigger('initialized');
        });
    },
    url: function(){
        return apiPathPrefix+'/'+this.collectionName;
    },
    next: function(model) {
        var i = this.at(this.indexOf(model));
        if (undefined === i || i < 0) return false;
        return this.at(this.indexOf(model) + 1);
    },
    prev: function(model) {
        var i = this.at(this.indexOf(model));
        if (undefined === i || i < 1) return false;
        return this.at(this.indexOf(model) - 1);
    },
    headCount: function(callback) {
        var self = this;
        var aj = $.ajax({
            type: "HEAD",
            url: self.url,
            data: {},
            complete: function(json) {
                callback(aj.getResponseHeader('X-Count'));
            },
            xhrFields: {
                withCredentials: true
            }
        });
    },
    refreshCount: function() {
        var self = this;
        self.headCount(function(count) {
            self.count = count;
            self.trigger('count', count);
        });
    },
    sortField: 'at-',
    load: function(options, success) {
        var self = this;
        if (!this.count) {
            this.refreshCount();
        }
        if (!options) {
            options = {};
        }
        if (!options.limit) {
            options.limit = self.pageSize;
        }
        if (!options.sort) {
            options.sort = this.sortField; //"at-";
        }
        this.applyFilters(options);
        this.fetch({
            data: options,
            update: true,
            remove: false,
            success: function(collection, response) {
                if (success) {
                    success();
                }
            },
            error: function(collection, response) {}
        });
    },
    search: function(term, callback) {
        var self = this;
        if (this.searching) return;
        this.searching = true;
        var limit = this.pageSize || 500;
        this.fetch({
            update: true,
            remove: false,
            data: {
                q: term,
                sort: this.sortField,
                limit: limit
            },
            complete: function() {
                self.searching = false;
                if (callback) {
                    callback();
                }
            }
        });
    },
    getNextPage: function(callback) {
        if (this.length < this.count) {
            this.load({
                skip: this.length
            }, callback);
        }
    },
    applyFilters: function(options) {
    
    },
    updateFilter: function(filter) {
        this.reset();
        this.load();
    },
    comparator: function(a) {
        var endStr = this.sortField.substr(this.sortField.length - 1);
        var sortStr = this.sortField;
        if (endStr === '-') {
            sortStr = this.sortField.substr(0, this.sortField.length - 1);
        }
    
        var v;
        if (sortStr === 'at') {
            if (a.has(sortStr)) {
                v = a.get(sortStr);
                v = new Date(v).getTime();
            } else {
                v = new Date().getTime();
            }
        } else if (a.has(sortStr)) {
            v = a.get(sortStr);
        }
        if (endStr === '-') {
            if (typeof v == 'string') {
                return String.fromCharCode.apply(String, _.map(v.split(''), function(c) {
                    return 0xffff - c.charCodeAt(0);
                }));
            }
            return v * -1;
        } else {
            return v;
        }
    },
    resetFilters: function() {},
    getOrFetch: function(id, callback) {
        var self = this;
        var doc;
        doc = this.get(id);
        if (doc) {
            callback(doc);
        } else {
            var options = {
                "_id": id
            };
            this.fetch({
                data: options,
                update: true,
                remove: false,
                success: function(collection, response) {
                    if (response) {
                        doc = self.get(id);
                        callback(doc);
                    } else {
                        callback(false);
                    }
                },
                error: function(collection, response) {
                    callback(false);
                }
            });
        }
    },
    getOrFetchByField: function(field, value, callback) {
        var self = this;
        var doc;
        var whereDoc = {};
        whereDoc[field] = value;
        doc = _.first(this.where(whereDoc));
        if (doc) {
            callback(doc);
        } else {
            var options = _.clone(whereDoc);
            this.fetch({
                data: options,
                update: true,
                remove: false,
                success: function(collection, response) {
                    if (response) {
                        doc = _.first(self.where(whereDoc));
                        callback(doc);
                    } else {
                        callback(false);
                    }
                },
                error: function(collection, response) {
                    callback(false);
                }
            });
        }
    },
    newModel: function(url, options, callback) {
        var self = this;
        var setDoc = {};
        if(!callback && typeof options == 'function') {
            callback = options;
            options = null;
        }
        var model = new this.Model({}, {
            collection: self
        });
        if (!url) {
            alert('URL required!');
            return false;
        }
        setDoc.url = url;
    
        if(options) {
            for(var o in options) {
                setDoc[o] = options[o];
            }
        }
        /*if(this.$public.is(':checked')) {
            setDoc.groups = ['public'];
        }*/
    
        model.set(setDoc, {
            silent: true
        });
        var saveModel = model.save(null, {
            silent: false,
            wait: true
        });
        if (saveModel) {
            saveModel.done(function() {
                //self.trigger("saved", self.model);
                if (!self.get(model.id)) {
                    self.add(model);
                }
                if (callback) {
                    callback(model);
                }
            });
        }
    },
    getView: function(options) {
        var self = this;
        if (!options) options = {};
        if (!this.hasOwnProperty("view")) {
            options.collection = this;
            this.view = new Backbone.House.List(options);
            this.view.on("selected", function(view) {
                self.trigger("selected", view.model);
            });
        }
        return this.view;
    },

});

 var ListView = Backbone.View.extend({
    initialize: function(options) {
        var self = this;
        var layout = options.layout || 'avatar';
        this.initLayout(layout);
        this.pagesLength = 1;
        this.currentPage = 1;
        this.$pager = $('<div class="pages"><ul class="pagination"><li class="previous"><a href="#">«</a></li><li><a href="#">1</a></li><li class="next"><a href="#">»</a></li></ul></div>');
        if (!this.collection) {
            // this.collection = new Collection();
        }
        this.pageSize = this.collection.pageSize;
        this.collection.bind("add", function(doc) {
            var view = self.getDocLayoutView(doc);
            self.appendRow(view);
            self.renderPagination();
            doc.on('remove', function() {
                view.$el.remove();
                return false;
            });
        });

        this.collection.on('reset', function() {
            self.render();
        });
        this.collection.on('count', function() {
            self.renderPagination();
        });
        this.collection.on('reset', function() {
            self.render();
        });
        /*$(window).scroll(function(){
            if(self.$el.is(":visible")) {
              if(!self.loading && $(window).scrollTop() + 250 >= $(document).height() - $(window).height()){
                self.loading = true;
                self.loadMore();
              }
            }
        });*/
    },
    initLayout: function(layout) {
        this.setLayout(layout, false);
    },
    setLayout: function(layout, render) {
        if (render !== false) {
            render = true;
        }
        var oldLayout = this.layout;
        this.layout = layout;
        //if (this.layout !== oldLayout) {
            if(this.$wrap) {
                this.$wrap.remove();
            }
            console.log(this.layout)
            if (this.layout == 'table') {
                this.$wrap = $('<table class="urlsList table table-striped table-hover"></table>');
                this.$ul = $('<tbody></tbody>');
                this.$wrap.append(this.$ul);
            } else if (this.layout == 'avatar') {
                this.$wrap = this.$ul = $('<div class="urlsList"></div>');
            } else if (this.layout == 'row') {
                this.$wrap = this.$ul = $('<ul class="urlsList"></ul>');
            }
        //}
        this.$el.prepend(this.$wrap);
        if (render) {
            this.renderPage(this.currentPage);
        }
    },
    filter: function(f) {
        var self = this;
        if (f && typeof f == 'function') {
            this.currentFilter = f;
            self.searchResults = this.collection.filter(function(model) {
                if (f(model)) {
                    //self.getDocLayoutView(model).$el.show();
                    return true;
                }
                //self.getDocLayoutView(model).$el.hide();
                return false;
            });
            self.renderPage(1);
            self.renderPagination();
        } else {
            self.currentFilter = false;
            delete self.searchResults;
            self.renderPage(1);
            self.renderPagination();
        }
    },
    search: function(q, callback) {
        var self = this;
        this.searchQ = q;
        console.log(q);
        if (q === '') {
            delete self.searchResults;
            self.renderPage(1);
            self.renderPagination();
            if (callback) {
                callback();
            }
            return;
        }
        var re = q;
        q = re.replace(/\?/gi, '\\?');
        var regex = new RegExp(q, 'i');
        this.collection.search(q, function() {
            self.searchResults = self.collection.filter(function(e) {
                return regex.test(e.get('url'));
            });
            self.renderPage(1);
            self.renderPagination();

            if (callback) {
                callback();
            }
        });
    },
    events: {
        "click .list-pager": "loadMore",
        "click .pagination li": "selectPage",
    },
    selectPage: function(e) {
        var i = $(e.target).attr('href').substr(1);
        if (i == 'next') {
            this.currentPage++;
            this.$pager.find('.active').next().addClass('active').siblings().removeClass('active');
        } else if (i == 'prev') {
            this.currentPage--;
            this.$pager.find('.active').prev().addClass('active').siblings().removeClass('active');
        } else {
            this.currentPage = i;
            $(e.target).parent().addClass('active').siblings().removeClass('active');
        }
        this.renderPage(this.currentPage);
        return false;
    },
    loadMore: function() {
        var self = this;
        this.collection.getNextPage(function() {
            self.loading = false;
        });
    },
    getDocLayoutView: function(doc) {
        var view;
        var viewOpts = {
            list: this
        };
        if (this.options.rowOptions) {
            viewOpts = this.options.rowOptions;
            viewOpts.list = this;
        }
        if (this.layout === 'row') {
            view = doc.getRow(viewOpts);
        } else if (this.layout === 'table') {
            view = doc.getTableRowView(viewOpts);
        } else if (this.layout === 'avatar') {
            view = doc.getAvatarView(viewOpts);
        }
        return view;
    },
    renderPagination: function() {
        //var c = this.collection.count > len ? this.collection.count : len;
        var cLen = this.collection.length;
        if (this.searchResults) {
            cLen = this.searchResults.length;
        } else if (this.collection.count) {
            cLen = this.collection.count;
        }
        //var cLen = this.searchResults ? this.searchResults.length : this.collection.length;
        this.pagesLength = Math.ceil(cLen / this.pageSize) + 1;
        if (this.$pager.find('ul li').length !== this.pagesLength + 2) {
            var liPages = '';
            var i = 1;
            while (i < this.pagesLength) {
                var liClass = '';
                if (i == this.currentPage) {
                    liClass = ' class="active"';
                }
                liPages = liPages + '<li' + liClass + '><a href="#' + i + '">' + i + '</a></li>';
                i++;
            }
            this.$pager.find('ul').html('<li class="previous"><a href="#prev">«</a></li>' + liPages + '<li class="next"><a href="#next">»</a></li>');
        }
    },
    renderPage: function(pageNum) {
        var self = this;
        this.$ul.html('');
        this.currentPage = pageNum; //
        var s = (pageNum - 1) * this.pageSize;
        var col = this.searchResults ? this.searchResults : this.collection;

        var l = col.length;
        if (col.count) {
            l = col.count;
        }
        var returnSlice = function() {
            var e = (l < s + self.pageSize) ? l : s + self.pageSize;
            col.slice(s, e).forEach(function(doc, i, c) {
                //console.log(arguments)
                var view = self.getDocLayoutView(doc);
                self.appendRow(view);
                self.renderPagination();
                doc.on('remove', function() {
                    view.$el.remove();
                    return false;
                });
            });
        }
        if (col.length < col.count) {
            col.load({
                skip: col.length
            }, returnSlice);
        } else {
            returnSlice();
        }
    },
    render: function() {
        var self = this;
        // this.$el.html('');
        // this.$el.append(this.$ul);
        // this.$ul.html('');
        this.setLayout(this.layout, true);
        //this.collection.sort({silent:true});
        this.collection.each(function(doc) {
            var view = self.getDocLayoutView(doc);
            self.appendRow(view);
        });
        this.$el.append(this.$pager);
        this.renderPagination();
        this.setElement(this.$el);
        return this;
    },
    renderPager: function() {
        var len = this.collection.length;
        var c = this.collection.count > len ? this.collection.count : len;
        this.$pager.find('.list-length').html(len);
        this.$pager.find('.list-count').html(c);
    },
    refreshPager: function() {},
    getModelSortRank: function(model) {
        var endStr = this.collection.sortField.substr(this.collection.sortField.length - 1);
        var sortField = this.collection.sortField;
        if (endStr === '-') {
            sortField = this.collection.sortField.substr(0, this.collection.sortField.length - 1);
        }
        if(sortField === 'at') {
            var rank = new Date(model.get('at'));
            return rank = rank.getTime();
        } else  if(sortField === 'views') {
            if (endStr === '-') {
                return model.get('views');
            }
            return model.get('views') * -1;
        }
    },
    appendRow: function(row) {
        //console.log(row.model)
        var rank = this.getModelSortRank(row.model);
        var rowEl = row.render().$el;
        if (this.currentFilter && !this.currentFilter(row.model)) {
            rowEl.hide();
        }
        rowEl.attr('data-sort-rank', rank);
        var d = false;
        var $lis = this.$ul.children();
        var last = $lis.last();
        var lastRank = parseInt(last.attr('data-sort-rank'), 10);
        if (true) { // rank > lastRank
            $lis.each(function(i, e) {
                if (d) return;
                var r = parseInt($(e).attr('data-sort-rank'), 10);
                if (rank > r) {
                    $(e).before(rowEl);
                    d = true;
                }
            });
        }
        if (!d) {
            this.$ul.append(rowEl);
        }
    }
});















/*
 * Override Backbone defaults
 */
Backbone.Collection = Backbone.Collection.extend({
    next: function(model) {
        var i = this.at(this.indexOf(model));
        if (undefined === i || i < 0) return false;
        return this.at(this.indexOf(model) + 1);
    },
    prev: function(model) {
        var i = this.at(this.indexOf(model));
        if (undefined === i || i < 1) return false;
        return this.at(this.indexOf(model) - 1);
    }
});
Backbone.Model = Backbone.Model.extend({
    next: function() {
        return this.collection.next(this);
    },
    prev: function() {
        return this.collection.prev(this);
    }
});

Backbone.Router.prototype.localStorageNavigationHistory = function(navigateArguments) {
    var n = this.getLocalStorageNavigationHistory();
    if(!n) {
        n = new Array;
    }
    if(n.length > 20) {
        n = n.slice(-10);
    }
    if(navigateArguments) {
        n.push(navigateArguments);
        localStorage.setItem(this.appName+'-navigation', JSON.stringify(n));
    }
    //return n;
}
Backbone.Router.prototype.getLocalStorageNavigationHistory = function() {
    if(!this.hasOwnProperty('appName')) {
        this.appName = 'app';
    }
    var n = JSON.parse(localStorage.getItem(this.appName+'-navigation'));
    return n;
}
var _navigate = Backbone.Router.prototype.navigate;

Backbone.Router.prototype.navigate = function(path, go) {
    var frag = Backbone.history.getFragment();
    Backbone.history.navDirection = 1;
    this.localStorageNavigationHistory(path);
    _navigate.apply(this, arguments);
    var wl = window.location.toString();
    if(go && frag !== path) {
        if(window.ActionsBackbone) {
            var action = new ActionsBackbone.Model({});
            action.set({a:"GET "+wl},{silent:true});
            action.save();
        } else {
            require(['/analytics/backbone-actions.js'], function(ActionsBackbone){
                window.ActionsBackbone = ActionsBackbone;
                var action = new ActionsBackbone.Model({});
                action.set({a:"GET "+wl},{silent:true});
                action.save();
            });
        }
    }
};

Backbone.History.prototype.checkUrl = function(e) {
    this.navDirection = 0;
    if(e.type == "popstate") {
        this.navDirection = -1;
    }
  var current = this.getFragment();
  if (current == this.fragment && this.iframe) current = this.getFragment(this.getHash(this.iframe));
  if (current == this.fragment) return false;
  if (this.iframe) this.navigate(current);
  this.loadUrl() || this.loadUrl(this.getHash());
}

var methodMap = {
  'create': 'POST',
  'update': 'PUT',
  'delete': 'DELETE',
  'read':   'GET'
};

var getValue = function(object, prop) {
  if (!(object && object[prop])) return null;
  return _.isFunction(object[prop]) ? object[prop]() : object[prop];
};

// TODO sync with offline storage

Backbone.sync = function(method, model, options) {
    //if(navigator && navigator.hasOwnProperty('onLine') && !navigator.onLine) {
    //    return;
    //}
  var type = methodMap[method];
  
  // Default options, unless specified.
  options || (options = {});

  // Default JSON-request options.
  var params = {type: type, dataType: 'json'};

  // Ensure that we have a URL.
  if (!options.url) {
    params.url = getValue(model, 'url') || urlError();
  }
  
  if (!options.hasOwnProperty('withCredentials')) {
      params.xhrFields = {
         withCredentials: true
      }
  } else {
      params.xhrFields = {
         withCredentials: options.withCredentials
      }
  }

  // Ensure that we have the appropriate request data.
  if (!options.data && model && (method == 'create' || method == 'update')) {
    params.contentType = 'application/json';
    params.data = JSON.stringify(model.toJSON());
  }
  
  if (params.type === 'PUT') {
      var restObj = {};
      var fullPut = true;
      var changedAttr = model.changedAttributes();
      //console.log(changedAttr);
      for(var i in changedAttr) {
          if(_.isUndefined(changedAttr[i]) || _.isNull(changedAttr[i])) {
              if(!restObj.hasOwnProperty("$unset")) {
                  restObj["$unset"] = {};
              }
              restObj["$unset"][i] = true;
              delete changedAttr[i];
              fullPut = false;
          }
      }
      //console.log(changedAttr);
      if(changedAttr) {
          restObj["$set"] = changedAttr;
          fullPut = false;
      }
      if(model.pulls) {
          restObj["$pull"] = model.pulls;
          delete model.pulls;
          fullPut = false;
      }
      if(model.pushes) {
          restObj["$push"] = model.pushes;
          delete model.pushes;
          fullPut = false;
      }
      if(model.pushAlls) {
          restObj["$pushAll"] = model.pushAlls;
          delete model.pushAlls;
          fullPut = false;
      }
      if(fullPut) {
          console.log('full put prevented');
          return false;
      }
      if(restObj.hasOwnProperty('$set') && _.size(restObj["$set"]) < 1) {
          delete restObj["$set"];
      }
      params.data = JSON.stringify(restObj);
  }

  // Don't process data on a non-GET request.
  if (params.type !== 'GET' && !Backbone.emulateJSON) {
    params.processData = false;
  }
  
  // Make the request, allowing the user to override any Ajax options.
  return $.ajax(_.extend(params, options));
};

Backbone.Model.prototype.pull = function(key, value, options) {
    var attrs, attr, val;
    
    // Handle both `"key", value` and `{key: value}` -style arguments.
    if (_.isObject(key) || key == null) {
      attrs = key;
      options = value;
    } else {
      attrs = {};
      attrs[key] = value;
    }
    
    // Extract attributes and options.
    options || (options = {});
    if (!attrs) return this;
    if (attrs instanceof Backbone.Model) attrs = attrs.attributes;
    options.pulls = {};
    var now = this.attributes;
    var escaped = this._escapedAttributes;
    var prev = this._previousAttributes || {};
    
    if(!this.pulls) this.pulls = {};
    // For each `set` attribute...
    for (attr in attrs) {
        val = attrs[attr];
        options.pulls[attr] = true;
        this.pulls[attr] = val;
        var ni = now[attr].indexOf(val);
        if(ni != -1) {
            delete now[attr][ni];
        }
    }
    // Fire the `"change"` events.
    if (!options.silent) {
        var pulling = this._pullings;
        this._pulling = true;
        for (var attr in this._silentPulls) this._pendingPulls[attr] = true;
        
        var pulls = _.extend({}, options.pulls, this._silentPulls);
        this._silent = {};
        for (var attr in pulls) {
            this.trigger('change:' + attr, this, this.get(attr), options);
        }
        if (pulling) return this;
        
        this.trigger('change', this, options);
        this._pulling = false;
    }
    return this;
}
Backbone.Model.prototype.push = function(key, value, options) {
    var attrs, attr, val;
    
    // Handle both `"key", value` and `{key: value}` -style arguments.
    if (_.isObject(key) || key == null) {
      attrs = key;
      options = value;
    } else {
      attrs = {};
      attrs[key] = value;
    }
    
    // Extract attributes and options.
    options || (options = {});
    if (!attrs) return this;
    if (attrs instanceof Backbone.Model) attrs = attrs.attributes;
    options.pushes = {};
    var now = this.attributes;
    var escaped = this._escapedAttributes;
    var prev = this._previousAttributes || {};
    
    if(!this.pushes) this.pushes = {};
    
    // For each `set` attribute...
    for (attr in attrs) {
        val = attrs[attr];
        options.pushes[attr] = true;
    
        this.pushes[attr] = val;
        if(!now.hasOwnProperty(attr)) {
            now[attr] = [];
        }
        now[attr].push(val);
    }
    // Fire the `"change"` events.
    if (!options.silent) {
        for (var attr in options.pushes) {
            this.trigger('change:' + attr, this, this.get(attr), options);
        }
        this.trigger('change', this, options);
    }
    return this;
}
Backbone.Model.prototype.pushAll = function(key, value, options) {
    var attrs, attr, val;
    
    // Handle both `"key", value` and `{key: value}` -style arguments.
    if (_.isObject(key) || key == null) {
      attrs = key;
      options = value;
    } else {
      attrs = {};
      attrs[key] = value;
    }
    
    // Extract attributes and options.
    options || (options = {});
    if (!attrs) return this;
    if (attrs instanceof Backbone.Model) attrs = attrs.attributes;
    options.pushAlls = {};
    var now = this.attributes;
    
    if(!this.pushAlls) this.pushAlls = {};
    
    // For each `set` attribute...
    for (attr in attrs) {
        val = attrs[attr];
        options.pushAlls[attr] = true;
    
        this.pushAlls[attr] = val;
        
        for(var i in val) {
            now[attr].push(val[i]);
        }
    }
    // Fire the `"change"` events.
    if (!options.silent) {
        for (var attr in options.pushAlls) {
            this.trigger('change:' + attr, this, this.get(attr), options);
        }
        this.trigger('change', this, options);
    }
    return this;
}
