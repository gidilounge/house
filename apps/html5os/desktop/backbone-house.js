var apiPathPrefix = (window.hasOwnProperty('config')) ? config.apiPrefix : '/api';
Backbone.House = {};
Backbone.House.Model = Backbone.Model.extend({
    views: {},
    initialize: function(attrs, options) {
        this.options = options || {};
        this.options.ownerFieldName = this.options.ownerFieldName || 'owner';
        this.options.userFieldName = this.options.userFieldName || 'user';
    },
    next: function() {
        return this.collection.next(this);
    },
    prev: function() {
        return this.collection.prev(this);
    },
    getOwner: function(callback) {
        if (this.has(this.options.ownerFieldName)) {
            var owner = this.get(this.options.ownerFieldName);
            var user = window.usersCollection.getOrFetch(owner.id, callback);
        }
    },
    getOwnerAttr: function() {
        return this.get(this.options.ownerFieldName);
    },
    getUser: function(callback) {
        if (this.has(this.options.userFieldName)) {
            var user = this.get(this.options.userFieldName);
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
    has: function(attr) {
        if(attr.indexOf('.') !== -1) {
            var attri = attr.indexOf('.');
            var attrFieldName = attr.substr(0, attri);
            var attrFieldSubName = attr.substr(attri+1);
            var attrObj = this.attributes[attrFieldName];
            if(attrObj) {
                return attrObj.hasOwnProperty(attrFieldSubName);
            } else {
                return false;
            }
        } else {
            return Backbone.Model.prototype.has.call(this, attr);
        }
    },
    get: function(attr) {
        if(attr.indexOf('.') !== -1) {
            var attri = attr.indexOf('.');
            var attrFieldName = attr.substr(0, attri);
            var attrFieldSubName = attr.substr(attri+1);
            var attrObj = this.attributes[attrFieldName];
            if(attrObj) {
                if(attrObj[attrFieldSubName]) {
                    return attrObj[attrFieldSubName];
                } else {
                    return null;
                }
            } else {
                return null;
            }
        } else {
            return Backbone.Model.prototype.get.call(this, attr);
        }
    },
    set: function(key, val, options) {
        var self = this;
        if(typeof key === 'string' && key.indexOf('.') !== -1) {
            Backbone.Model.prototype.set.call(this, key, val, options);
            var attri = key.indexOf('.');
            var attrFieldName = key.substr(0, attri);
            var attrFieldSubName = key.substr(attri+1);
            this.attributes[attrFieldName][attrFieldSubName] = _.clone(this.attributes[key]);
            delete this.attributes[key];
        } else if(typeof key === 'object') {
            Backbone.Model.prototype.set.call(this, key, val, options);
            for(var f in key) {
                if(typeof f === 'string' && f.indexOf('.') !== -1) {
                    // TODO - cleanup attributes
                    var attri = f.indexOf('.');
                    var attrFieldName = f.substr(0, attri);
                    var attrFieldSubName = f.substr(attri+1);
                    this.attributes[attrFieldName][attrFieldSubName] = _.clone(this.attributes[f]);
                    delete this.attributes[f];
                }
            }
        } else {
            return Backbone.Model.prototype.set.call(this, key, val, options);
        }
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
    getNavigateUrl: function() {
        var path = $('base[href]').attr('href')+this.getNavigatePath();
        return window.location.protocol+'//'+window.location.hostname+path;
    },
    getSharePath: function() {
        return this.getNavigatePath();
    },
    getShareUrl: function() {
        var path = $('base[href]').attr('href')+this.getSharePath();
        return window.location.protocol+'//'+window.location.hostname+path;
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
                // console.log(doc);
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
                    // console.log('update model with doc')
                    model.set(doc, {
                        silent: true
                    });
                    model.renderViews();
                }
            }
            var collectionNameCap = self.collectionName[0].toUpperCase()+self.collectionName.substr(1);
            socket.on('inserted'+collectionNameCap, function(doc) {
                // console.log('inserted '+collectionNameCap);
                insertOrUpdateDoc(doc);
                self.count++;
                self.trigger('count', self.count);
            });
            socket.on('updated'+collectionNameCap, function(doc) {
                insertOrUpdateDoc(doc);
            });
            socket.on('deleted'+collectionNameCap, function(id) {
                // console.log(arguments)
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
    headCount: function(options, callback) {
        var self = this;
        var url = (typeof self.url === 'function') ? self.url() : self.url;
        var aj = $.ajax({
            type: "HEAD",
            url: url,
            data: options,
            complete: function(json) {
                callback(parseInt(aj.getResponseHeader('X-Count'), 10));
            },
            xhrFields: {
                withCredentials: true
            }
        });
    },
    refreshCount: function(opts) {
        if(!opts) {
            opts = {};
        }
        var self = this;
        self.headCount(opts, function(count) {
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
        if (!options.limit && self.pageSize !== 0) {
            options.limit = self.pageSize;
        }
        if (!options.sort) {
            options.sort = this.sortField; //"at-";
        }
        this.applyFilters(options);
        // console.log(options)
        this.trigger('loading');
        this.fetch({
            data: options,
            update: true,
            remove: false,
            success: function(collection, response) {
                self.trigger('loadingComplete');
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
    loadSkip: function(skip, callback) {
        this.load({skip: skip}, callback);
    },
    getNextPage: function(callback) {
        if (this.length < this.count) {
            this.loadSkip(this.length, callback);
        }
    },
    applyFilters: function(options) {
        if(this.view && this.view.searchLoad) {
            // console.log('search load filter')
            options = _.defaults(options, this.view.searchLoad);
            // console.log(options)
            // loadOpts = _.clone(this.searchLoad);
        }
        return options;
    },
    updateFilter: function(filter) {
        this.reset();
        this.load();
    },
    comparator: function(a) {
        // console.log(this.sortField)
        var endStr = this.sortField.substr(this.sortField.length - 1);
        var sortStr = this.sortField;
        if (endStr === '-') {
            sortStr = this.sortField.substr(0, this.sortField.length - 1);
        }
    
        var v = a.get(sortStr);
        
        if (sortStr === 'at') {
            if (a.has(sortStr)) {
                v = a.get(sortStr);
                v = new Date(v).getTime();
            } else {
                v = new Date().getTime();
            }
        } else if (a.has(sortStr)) {
            // v = a.get(sortStr);
            if(typeof v === 'number') {
                
            } else if(typeof v === 'string') {
                
            } else {
                console.log(typeof v);
            }
        }
        // console.log(v);
        
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
            this.view = new ListView(options);
            this.view.on("selected", function(view) {
                self.trigger("selected", view.model);
            });
        }
        return this.view;
    },

});

var ListSearch = Backbone.View.extend({
    initialize: function(options) {
        var self = this;
        self.fieldName = options.search.fieldName || 'title';
        this.options.placeholder = this.options.placeholder || 'Search '+this.options.list.collection.collectionName;
        this.$input = $('<input type="text" class="form-control" placeholder="'+this.options.placeholder+'" data-loading-text="loading">');
    },
    render: function() {
        var self = this;
        this.$el.append(this.$input);
        this.setElement(this.$el);
        return this;
    },
    events: {
        "submit input": "submit",
        "keyup input": "debouncedKeyUp",
        "keydown input": "keyDown"
    },
    keyDown: function(e) {
        if(e.keyCode === 13) {
            this.submit();
            return false;
        } 
    },
    debouncedKeyUp: _.debounce(function(e) {
        this.keyUp(e);
    }, 500),
    keyUp: function(e) {
        if (e.keyCode == 27) {
            this.$input.val('');
            delete this.selectedQuery;
        }
        //console.log(e.keyCode)
        if (!this.hasOwnProperty('prevInputVal') || this.$input.val() !== this.prevInputVal) {
            this.prevInputVal = this.$input.val();
            this.selectedQuery = this.$input.val().trim();
            this.trigger('search', this.$input.val().trim());
        }
        return false;
    },
    disableForm: function() {
        this.$input.attr('disabled', 'disabled');
    },
    focus: function() {
        this.$input.focus();
    },
    submit: function(e) {
        // this.disableForm();
        this.selectedQuery = this.$input.val().trim();
        this.trigger('search', this.$input.val().trim());
        return false;
    },
    getSearchFilterFunc: function() {
        var self = this;
        if(this.selectedQuery) {
            return function(model, filterObj) {
                var filterQuery = filterObj.search;
                // console.log(model);
                // console.log(filterId);
                var fieldValue = model.get(self.fieldName);
                var regex = new RegExp(filterQuery, 'i');
                return regex.test(fieldValue);
            }
        } else {
            return function() {
                return true;
            }
        }
    }
});

var ListSorts = Backbone.View.extend({
    initialize: function(options) {
        var self = this;
        console.log(this.options)
        console.log(this.options.sorts)
        this.defaultSort = this.options.defaultSort || 'id-';
        var lis = '';
        for(var s in this.options.sorts) {
            var sort = this.options.sorts[s];
            lis = lis + '<li data-sort="'+sort.field+'"><a href="#"><span class="glyphicon glyphicon-'+sort.glyphicon+'"></span> '+sort.name+'</a></li>';
            if(sort.hasOwnProperty('default')) {
                this.defaultSort = sort.field;
                if(sort.default < 0) {
                    this.defaultSort = sort.field+'-';
                }
            }
        }
        this.$btnGroup = $('<div class="btn-group sorts" data-toggle="buttons">\
    <button title="Sort" type="button" class="btn btn-link dropdown-toggle" data-toggle="dropdown"><span class="sortIcon glyphicon glyphicon-sort"></span></button>\
    <ul class="dropdown-menu" role="menu">'+lis+'</ul>\
</div>');
    },
    render: function() {
        var self = this;
        this.$el.append(this.$btnGroup);
        this.setElement(this.$el);
        return this;
    },
    events: {
        // "click label.btn": "clickBtnLabel"
        "click .sorts li": "clickSort",
    },
    clickSort: function(e) {
        var self = this;
        var $et = $(e.currentTarget);
        var sortField = $et.attr('data-sort');
        if(this.sortFieldSelected && this.sortFieldSelected === sortField) {
            if(sortField.substr(-1) === '-') {
                this.sortFieldSelected = sortField.substr(0, sortField.length-1);
            } else {
                this.sortFieldSelected = sortField + '-';
            }
        } else {
            this.sortFieldSelected = sortField;
        }
        console.log(this.sortFieldSelected)
        this.options.list.collection.sortField = this.sortFieldSelected;
        this.options.list.collection.sort();
        this.options.list.collection.load({},function(){
            self.options.list.collection.sort();
            self.options.list.renderPage(1);
        });
        
        // this.trigger('sortField', sortField);
        e.preventDefault();
    },
});

var ListTags = Backbone.View.extend({
    initialize: function(options) {
        var self = this;
        this.options = options;
        self.fieldName = options.tags.fieldName || 'tags';
        console.log(self.fieldName)
        utils.initTags(function(){
            self.tagSelectView = new TagsBackbone.SelectDropdown({});
            var loadObj = {};
            self.tagSelectView.on('deselected', function() {
                var deselectFilterObj = {};
                if(self.options.list.filterView.selectedFilter) {
                    deselectFilterObj.filter = self.options.list.filterView.selectedFilter;
                    self.options.list.filter(function(model, filterId) {
                        console.log(filterId)
                        if(self.options.list.filterView.getFilterFunc()(model, deselectFilterObj)) {
                            return true;
                        }
                    }, deselectFilterObj, self.options.list.filterView.options.filters[deselectFilterObj.filter].load);
                } else {
                    self.options.list.filter(function(model, filterId) {
                        return true;
                    });
                }
            });
            self.tagSelectView.on('selected', function(tag) {
                // console.log(tag);
                
                var filterFunc = function(m, v) {
                    console.log(arguments)
                    if(self.getTagFilterFunc()(m,v)) {
                        console.log('testatags')
                        if(self.options.list.filterView.getFilterFunc()(m,v)) {
                            return true;
                        }
                    }
                }
                
                var filterObj = {tag: tag.get('name')};
                
                if(self.options.list.filterView.selectedFilter) {
                    filterObj.filter = self.options.list.filterView.selectedFilter;
                    loadObj = self.options.list.filterView.options.filters[self.options.list.filterView.selectedFilter].load;
                }
                loadObj[self.fieldName] = tag.get('name');
                
                self.options.list.filter(filterFunc, filterObj, loadObj);
            });
            self.initialized = true;
            self.trigger('initialized');
        });
    },
    render: function() {
        var self = this;
        this.setElement(this.$el);
        if(!this.initialized) {
            this.on('initialized', this.render);
            return this;
        }
        this.$el.append(self.tagSelectView.render().$el);
        return this;
    },
    events: {
    },
    getTagFilterFunc: function() {
        var self = this;
        if(self.tagSelectView.selectedTag) {
            return function(model, filterObj) {
                console.log(filterObj)
                var filterId = filterObj.tag;
                // console.log(model);
                // console.log(filterId);
                var tags = model.get(self.fieldName);
                // console.log(self.fieldName);
                
                for(var t in tags) {
                    var tag = tags[t];
                    if(tag.name === filterId) {
                        return true;
                    }
                }
                return false;
            };
        } else {
            return function() {
                return true;
            }
        }
    }
});

var ListFilters = Backbone.View.extend({
    initialize: function(options) {
        var self = this;
        var lis = '';
        this.options = options;
        if(this.options.filters) {
            for(var id in this.options.filters) {
                var li = this.options.filters[id];
                var className = li.glyphicon ? 'glyphicon glyphicon-'+li.glyphicon : '';
                lis = lis + '<li data-filter="'+id+'"><a href="#"><span class="'+className+'"></span> '+li.txt+'</a></li>';
            }
        }
        // <li data-filter="image"><a href="#" class="glyphicon glyphicon-picture"> Image</a></li>\
        // <li data-filter="audio"><a href="#" class="glyphicon glyphicon-music"> Audio</a></li>\
        // <li data-filter="video"><a href="#" class="glyphicon glyphicon-film"> Video</a></li>\
        // <li data-filter="text"><a href="#" class="glyphicon glyphicon-font"> Text</a></li>\
        this.$btnGroup = $('<div class="btn-group filters">\
    <button title="Filter" type="button" class="btn btn-link dropdown-toggle" data-toggle="dropdown"><span class="filterIcon glyphicon glyphicon-filter"></span></button>\
    <ul class="dropdown-menu" role="menu">'+lis+'\
        <li class="divider"></li>\
        <li data-filter="none"><a href="#" class=""><span class="glyphicon glyphicon-filter"></span> No Filter</a></li>\
    </ul>\
</div>');
    },
    render: function() {
        var self = this;
        this.$el.append(this.$btnGroup);
        this.setElement(this.$el);
        return this;
    },
    events: {
        "click .filters li": "clickFilter",
    },
    clickFilter: function(e) {
        var self = this;
        var $et = $(e.currentTarget);
        var f = $et.attr('data-filter');
        if(f === 'none') {
            // this.trigger('unfilter');
            this.$btnGroup.find('.filterIcon').addClass('glyphicon-filter');
            delete this.selectedFilter;
            
            if(self.options.list.tagsView.tagSelectView.selectedTag) {
                var filterObj = {};
                // filterObj.filter = f;
                filterObj.tag = self.options.list.tagsView.tagSelectView.selectedTag.get('name');
                var loadObj = {};
                loadObj[self.options.list.tagsView.fieldName] = self.options.list.tagsView.tagSelectView.selectedTag.get('name');
                this.options.list.filter(self.options.list.tagsView.getTagFilterFunc(), filterObj, loadObj);
            } else {
                this.options.list.filter(function(){
                    return true;
                });
            }
            
            this.trigger('unfiltered');
        } else {
            // this.trigger('filterBy', f);
            if(this.options.filters && this.options.filters[f]) {
                // console.log(this.options.filters[f]);
                // var filterFunc = this.options.filters[f].filter;
                this.selectedFilter = f;
                var filterFunc = function(m, v) {
                    // console.log(arguments)
                    if(self.options.list.tagsView.getTagFilterFunc()(m,v)) {
                        if(self.getFilterFunc()(m,v)) {
                            return true;
                        }
                    }
                }
                var filterObj = {};
                var loadObj = this.options.filters[f].load;
                filterObj.filter = f;
                if(self.options.list.tagsView.tagSelectView.selectedTag) {
                    filterObj.tag = self.options.list.tagsView.tagSelectView.selectedTag.get('name');
                    loadObj[self.options.list.tagsView.fieldName] = self.options.list.tagsView.tagSelectView.selectedTag.get('name');
                }
                console.log(filterObj)
                this.options.list.filter(filterFunc, filterObj, loadObj);
                this.$btnGroup.find('.filterIcon').attr('class', 'filterIcon glyphicon glyphicon-'+this.options.filters[f].glyphicon);
            }
            this.trigger('filteredBy', f);
        }
        e.preventDefault();
    },
    getFilterFunc: function() {
        if(this.selectedFilter) {
            return this.options.filters[this.selectedFilter].filter;
        } else {
            return function() {
                return true;
            }
        }
    }
});

var ListPagination = Backbone.View.extend({
    initialize: function(options) {
        var self = this;
        this.$pageWrap = $('<span class="paginationWrap"><ul class="pagination"><li class="previous"><a href="#">«</a></li><li><a href="#">1</a></li><li class="next"><a href="#">»</a></li></ul></span>');
        this.$pageSizeWrap = $('<span class="pageSizeWrap">\
    <div class="btn-group pageSizes" data-toggle="buttons">\
        <button title="Page Size" type="button" class="btn btn-link dropdown-toggle" data-toggle="dropdown"><span class="pageSize"></span> of <span class="collectionSize"></span> <span class="collectionName">'+this.options.list.collection.collectionName+'</span></button>\
        <ul class="dropdown-menu" role="menu">\
            <li data-size="10"><a href="#" class="">10 per page</a></li>\
            <li data-size="25"><a href="#" class="">25 per page</a></li>\
            <li data-size="50"><a href="#" class="">50 per page</a></li>\
            <li data-size="100"><a href="#" class="">100 per page</a></li>\
            <li data-size="200"><a href="#" class="">200 per page</a></li>\
            <li class="divider"></li>\
            <li data-size="0"><a href="#" class="">&#8734; Infinite Scroll</a></li>\
        </ul>\
    </div>\
</span>');
        options.list.collection.on('remove', function(){
            self.render();
            
            // TODO CLEANUP
            // for now decrement on client without doing an immediate HEAD request
            if (self.options.list.searchResults) {
                if(self.options.list.searchCount) {
                    self.options.list.searchCount = self.options.list.searchCount - 1;
                } else {
                    // self.options.list.searchResults.length;
                }
            } else if (self.options.list.collection.count) {
                self.options.list.collection.count = self.options.list.collection.count - 1;
            }
        });
        options.list.collection.on('add', function(){
            self.render();
        });
    },
    render: function() {
        var self = this;
        
        if(this.options.list.pageSize === 0) {
            if (this.options.list.searchResults) {
                this.$pageSizeWrap.find('.pageSize').html(this.options.list.searchResults.length);
            } else {
                this.$pageSizeWrap.find('.pageSize').html(this.options.list.collection.length);
            }
            this.$pageWrap.find('ul.pagination').hide();
        } else {
            this.$pageSizeWrap.find('.pageSize').html(this.options.list.pageSize);
            this.$pageWrap.find('ul.pagination').show();
        }
        var cLen = this.options.list.collection.length;
        if (this.options.list.searchResults) {
            if(this.options.list.searchCount) {
                cLen = this.options.list.searchCount;
            } else {
                cLen = this.options.list.searchResults.length;
            }
        } else if (this.options.list.collection.count) {
            cLen = this.options.list.collection.count;
        }
        this.$pageSizeWrap.find('.collectionSize').html(cLen.toLocaleString());
        //var cLen = this.searchResults ? this.searchResults.length : this.collection.length;
        this.options.list.pagesLength = Math.ceil(cLen / this.options.list.pageSize); // + 1;
        
        if(this.options.list.pagesLength < this.options.list.currentPage) {
            this.options.list.currentPage = this.options.list.pagesLength;
            // this.renderPage(pageNum);
        } else if(this.options.list.currentPage < 1) {
            // pageNum = 1;
            this.options.list.currentPage = 1;
        }
        
        var pageHash = '#'+this.options.list.currentPage;
        this.$pageWrap.find('li a[href="'+pageHash+'"]').addClass('active').siblings().removeClass('active');
        
        var maxPagesUi = 2;
        if (this.$pageWrap.find('ul.pagination li').length !== this.options.list.pagesLength + 2 + maxPagesUi) {
            var liPages = '';
            var i = 1;
            var p = this.options.list.pagesLength;
            if(this.options.list.pagesLength > maxPagesUi) {
                //i = Math.floor(this.pagesLength / 2)-1;
                i = this.options.list.currentPage - 1;
                if(i === 0) {
                    i = 1;
                }
                if(this.options.list.pagesLength <= i+1) {
                    i = i-1;
                }
                p = maxPagesUi + i;
            }
            while (i < p+1) {
                var liClass = '';
                if (i == this.options.list.currentPage) {
                    liClass = ' class="active"';
                }
                liPages = liPages + '<li' + liClass + '><a href="#' + i + '">' + i + '</a></li>';
                i++;
            }
            //this.$pageWrap.find('ul.pagination').html('<li class="previous"><a href="#prev">«</a></li>' + liPages + '<li class="next"><a href="#next">»</a></li>');
            this.$pageWrap.find('ul.pagination').html('<li class="first"><a href="#first">«</a></li>' + liPages + '<li class="last"><a href="#last">»</a></li>');
        }
        
        if(this.options.list.currentPage === 1) {
            this.$pageWrap.find('ul.pagination .first').addClass('disabled');
        } else {
            this.$pageWrap.find('ul.pagination .first').removeClass('disabled');
        }
        if(this.options.list.currentPage === this.options.list.pagesLength) {
            this.$pageWrap.find('ul.pagination .last').addClass('disabled');
        } else {
            this.$pageWrap.find('ul.pagination .last').removeClass('disabled');
        }
        
        if(this.options.list.currentPage < 2) {
            this.$pageWrap.find('ul.pagination .previous').addClass('disabled');
        // } else if(this.pagesLength > 1) {
            // this.$pageWrap.find('ul.pagination .previous').show();
        } else {
            this.$pageWrap.find('ul.pagination .previous').removeClass('disabled');
        }
        if(this.options.list.currentPage === this.options.list.pagesLength) {
            this.$pageWrap.find('ul.pagination .next').addClass('disabled');
        } else {
            this.$pageWrap.find('ul.pagination .next').removeClass('disabled');
        }
        this.$el.append(this.$pageWrap);
        this.$el.append(this.$pageSizeWrap);
        this.setElement(this.$el);
        return this;
    },
    events: {
        "click .pagination li": "selectPage",
        "click .pageSizes li": "selectPageSize",
    },
    selectPage: function(e) {
        // console.log(e)
        var i = $(e.currentTarget).find('a').attr('href').substr(1);
        if($(e.currentTarget).hasClass('disabled')) {
            return false;
        }
        
        if (i == 'first') {
            this.options.list.currentPage = 1;
            this.$pageWrap.find('li a[href="#'+this.options.list.currentPage+'"]').addClass('active').siblings().removeClass('active');
        } else if (i == 'last') {
            this.options.list.currentPage = this.options.list.pagesLength;
            this.$pageWrap.find('li a[href="#'+this.options.list.currentPage+'"]').addClass('active').siblings().removeClass('active');
        } else if (i == 'next') {
            this.options.list.currentPage++;
            this.$pageWrap.find('.active').next().addClass('active').siblings().removeClass('active');
        } else if (i == 'prev') {
            this.options.list.currentPage--;
            this.$pageWrap.find('.active').prev().addClass('active').siblings().removeClass('active');
        } else {
            this.options.list.currentPage = parseInt(i, 10);
            $(e.currentTarget).addClass('active').siblings().removeClass('active');
        }
        this.options.list.renderPage(this.options.list.currentPage);
        return false;
    },
    selectPageSize: function(e) {
        // console.log(e)
        var $et = $(e.currentTarget);
        var pageSize = parseInt($et.attr('data-size'), 10);
        this.options.list.setPageSize(pageSize);
        this.options.list.renderPage(this.options.list.currentPage);
        e.preventDefault();
    },
});

var ListLayout = Backbone.View.extend({
    initialize: function(options) {
        var self = this;
        this.layoutSelected = 'row';
        
        this.layouts = this.options.list.options.layouts || {
            "row": {
                title: 'Row',
                glyphicon: 'list'
            },
            "table": {
                title: 'Table',
                glyphicon: 'th-list'
            },
            "avatar": {
                title: 'Avatar',
                glyphicon: 'th-large'
            }
        };
        var lis = '';
        for(var i in this.layouts) {
            var action = this.layouts[i];
            if(action.default) {
                this.layoutSelected = i;
            }
            lis = lis + '<li class="layout" data-layout="'+i+'"><a href="#"><span class="glyphicon glyphicon-'+action.glyphicon+'"> </span> '+action.title+'</a></li>';
        }
        
        this.$btnGroup = $('<div class="btn-group layouts" data-toggle="buttons">\
    <button title="List View" type="button" class="btn btn-link dropdown-toggle" data-toggle="dropdown"><span class="filterIcon glyphicon glyphicon-list"></span></button>\
    <ul class="dropdown-menu" role="menu">\
        '+lis+'\n\
    </ul>\
</div>');
// <label class="btn btn-default row active" data-layout="row" title="Row View">\
//     <input type="radio" name="options" id="list"><span class="glyphicon glyphicon-list"> </span>\
//   </label>\
//   <label class="btn btn-default table" data-layout="table" title="Table View">\
//     <input type="radio" name="options" id="table"><span class="glyphicon glyphicon-th-list"> </span>\
//   </label>\
//   <label class="btn btn-default avatar" data-layout="avatar" title="Avatar View">\
//     <input type="radio" name="options" id="avatar"><span class="glyphicon glyphicon-th-large"> </span>\
//   </label>\
    },
    renderActiveLayout: function() {
        var layout = this.layoutSelected;
        // this.$btnGroup.find('.btn.'+layout).addClass('active').siblings().removeClass('active');
        var classes = 'filterIcon glyphicon glyphicon-';
        if(layout === 'row') {
            classes = classes+'list';
        } else if(layout === 'table') {
            classes = classes+'th-list';
        } else if(layout === 'avatar') {
            classes = classes+'th-large';
        } else {
            classes = classes+'list';
        }
        this.$btnGroup.find('.filterIcon').attr('class', classes);
    },
    render: function() {
        var self = this;
        this.renderActiveLayout();
        this.$el.append(this.$btnGroup);
        this.setElement(this.$el);
        return this;
    },
    events: {
        // "click label.btn": "clickBtnLabel"
        "click .layouts li": "clickLayout",
    },
    clickLayout: function(e) {
        var $et = $(e.currentTarget);
        var layout = $et.attr('data-layout');
        this.layoutSelected = layout;
        this.renderActiveLayout();
        if(layout === 'row') {
            this.trigger('layout', layout);
        } else if(layout === 'table') {
            this.trigger('layout', layout);
        } else if(layout === 'avatar') {
            this.trigger('layout', layout);
        } else {
            this.trigger('layout', layout);
        }
        e.preventDefault();
    },
    clickBtnLabel: function(e) {
        var $et = $(e.currentTarget);
        var layout = $et.attr('data-layout');
        this.trigger('layout', layout);
        e.preventDefault();
    },
});

var ListSelection = Backbone.View.extend({
    initialize: function(options) {
        var self = this;
        this.selectedViews = [];
        this.actions = this.options.selection.actions || {};
        var lis = '';
        for(var i in this.actions) {
            var action = this.actions[i];
            lis = lis + '<li class="action" data-action-id="'+i+'"><a href="#"><span class="glyphicon glyphicon-'+action.glyphicon+'"> </span> '+action.title+'</a></li>';
        }
        this.$btnGroup = $('<div class="btn-group selection" data-toggle="buttons">\
    <button title="Selection Actions" type="button" class="btn btn-link dropdown-toggle" data-toggle="dropdown"><span class="selectIcon glyphicon glyphicon-unchecked"></span> <span class="selectionCount"> </span></button>\
    <ul class="dropdown-menu" role="menu">\
        '+lis+'\n\
        <li class="toggleSelectAll all" data-action-id="toggle"><a href="#"><span class="glyphicon glyphicon-check"></span> Select All</a></li>\
        <li class="toggleSelectCol all" data-action-id="toggleCol"><a href="#"><span class="glyphicon glyphicon-check"></span> Select All Pages<span class="count"></span></a></li>\
    </ul>\
</div>');
        this.$toggle = this.$btnGroup.find('.toggleSelectAll');
        this.$toggleCol = this.$btnGroup.find('.toggleSelectCol');
        this.options.list.on('selected', function(view){
            self.selectedViews.push(view);
            self.renderSelectedCount(self.selectedViews.length);
        });
        this.options.list.on('deselected', function(view){
            self.selectedViews = _.without(self.selectedViews, view);
            self.renderSelectedCount(self.selectedViews.length);
        });
    },
    renderSelectedCount: function(c) {
        if(c > 0) {
            this.$el.find('.selectIcon').removeClass('glyphicon-unchecked').addClass('glyphicon-check');
            if(this.$toggle.hasClass('all')) {
                this.$toggle.removeClass('all').addClass('none').find('a').html('<span class="glyphicon glyphicon-unchecked"></span> Deselect');
            }
        } else {
            this.$el.find('.selectIcon').removeClass('glyphicon-check').addClass('glyphicon-unchecked');
            if(this.$toggle.hasClass('all')) {
            } else {
                this.$toggle.removeClass('none').addClass('all').find('a').html('<span class="glyphicon glyphicon-check"></span> Select All');
            }
        }
        if(c) {
            this.$btnGroup.find('.selectionCount').html(c);
        } else {
            this.$btnGroup.find('.selectionCount').html('');
        }
    },
    render: function() {
        var self = this;
        this.$el.append(this.$btnGroup);
        this.setElement(this.$el);
        return this;
    },
    events: {
        // "click label.btn": "clickBtnLabel"
        "click .toggleSelectCol": "clickToggleCol",
        "click .toggleSelectAll": "clickToggle",
        "click li.action": "clickAction"
    },
    clickAction: function(e) {
        var self = this;
        var $et = $(e.currentTarget);
        var actionId = $et.attr('data-action-id');
        var actionFunc = this.actions[actionId].action;
        var viewsBatch = _.clone(this.selectedViews);
        var completeFunc = function() {
            alert('Batch process complete.');
        }
        if(this.actions[actionId].complete) {
            completeFunc = this.actions[actionId].complete;
        }
        
        var procView = function() {
            var view = viewsBatch.pop();
            actionFunc(view.model, function(){
                if(viewsBatch.length > 0) {
                    procView();
                } else {
                    
                    if(!self.$toggleCol.hasClass('all')) {
                        console.log('finish collection');
                        
                        // load more
                        self.options.list.loadMore(function(){
                            self.listSelectAll();
                            
                            console.log(self.selectedViews);
                            // reload our var
                            setTimeout(function(){ // just a moment to make sure the selects trigger
                                viewsBatch = _.clone(self.selectedViews);
                                procView();
                            },300);
                        });
                        
                        // select all, repeat action
                        
                    } else {
                        completeFunc();
                    }
                }
            })
        }
        if(this.actions[actionId].confirm) {
            var confirmFunc = this.actions[actionId].confirm;
            if(viewsBatch.length > 0 && confirmFunc()) {
                procView();
            }
        } else {
            if(viewsBatch.length > 0) {
                procView();
            }
        }
    },
    clickToggle: function(e) {
        if(this.$toggle.hasClass('all')) {
            this.listSelectAll();
        } else {
            this.listDeselect();
        }
    },
    clickToggleCol: function(e) {
        if(this.$toggleCol.hasClass('all')) {
            this.listSelectAll();
            this.$toggleCol.hide();
            this.$toggleCol.removeClass('all');
        } else {
            this.listDeselect();
        }
    },
    listSelectAll: function() {
        this.$toggle.removeClass('all').addClass('none').find('a').html('<span class="glyphicon glyphicon-unchecked"></span> Deselect');
        
        if (this.options.list.searchResults) {
            console.log(this.options.list.searchResults);
            for(var i in this.options.list.searchResults) {
                var r = this.options.list.searchResults[i];
                this.options.list.getDocLayoutView(r).select();
            }
            // this.$pageSizeWrap.find('.pageSize').html(this.options.list.searchResults.length);
        } else {
            // this.$pageSizeWrap.find('.pageSize').html(this.options.list.collection.length);
            this.options.list.collection.each(function(v){
                this.options.list.getDocLayoutView(v).select();
            });
        }
    },
    listDeselect: function() {
        this.$toggleCol.removeClass('none').addClass('all').show();
        this.$toggle.removeClass('none').addClass('all').find('a').html('<span class="glyphicon glyphicon-check"></span> Select All');
        var views = _.clone(this.selectedViews);
        for(var i in views) {
            var view = views[i];
            if(view && view.deselect) {
                view.deselect();
            }
        }
    },
    listSelectedViews: function() {
        return this.selectedViews;
    },
});

var ListView = Backbone.View.extend({
    className: 'houseCollection',
    initialize: function(options) {
        var self = this;
        this.options = options;
        if (!this.collection) {
            // this.collection = new Collection();
        }
        this.$el.addClass(this.collection.collectionName);
        // console.log(options);
        this.pagesLength = 1;
        this.currentPage = 1;
        this.$header = $('<div class="houseCollectionHeader"></div>');
        this.$footer = $('<div class="houseCollectionFooter"></div>');
        this.$search = $('<span class="search"></span>');
        this.$tags = $('<span class="tags"></span>');
        this.$filter = $('<span class="filter"></span>');
        this.$sort = $('<span class="sort"></span>');
        this.$selection = $('<span class="selection"></span>');
        this.$layout = $('<span class="layout"></span>');
        this.$pager = $('<span class="pages"></span>');
        if(this.options.headerEl) {
            this.$header = this.options.headerEl;
        }
        this.$header.append(this.$search);
        this.$header.append(this.$tags);
        this.$header.append(this.$filter);
        this.$header.append(this.$sort);
        this.$header.append(this.$layout);
        this.$header.append(this.$selection);
        this.$header.append(this.$pager);
        
        this.pageSize = this.collection.pageSize;
        this.setPageSize(this.pageSize);
        
        this.collection.bind("add", function(doc) {
            var view = self.getDocLayoutView(doc);
            self.appendRow(view);
            self.renderPagination();
            doc.on('remove', function() {
                
                self.collection.remove(doc, {silent: true});
                if(self.searchResults) {
                    self.searchResults = _.without(self.searchResults, doc);
                }
                
                view.$el.remove();
                return false;
            });
        });
        this.collection.bind("remove", function(doc) {
            self.debouncedMasonReload();
            
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
        this.collection.on('loading', function(){
            self.renderLoading();
        });
        this.collection.on('loadingComplete', function(){
            self.renderLoading(false);
        });
        
        if(this.options.layouts) {
            this.layoutView = new ListLayout({el: this.$layout, list: this, layouts: this.options.layouts});
            this.layoutView.on('layout', function(layout) {
                self.setLayout(layout);
            });
            this.initLayout(this.layoutView.layoutSelected);
        } else {
            var layout = options.layout || 'avatar';
            this.initLayout(layout);
        }
        
        if(this.options.tags) {
            this.tagsView = new ListTags({el: this.$tags, list: this, tags: this.options.tags});
        }
        if(this.options.filters) {
            this.filterView = new ListFilters({el: this.$filter, list: this, filters: this.options.filters});
        }
        if(this.options.sorts) {
            this.sortView = new ListSorts({el: this.$sort, list: this, sorts: this.options.sorts});
        }
        if(this.options.selection) {
            this.selectionView = new ListSelection({el: this.$selection, list: this, selection: this.options.selection});
        }
        
        if(this.options.search) {
            this.searchView = new ListSearch({el: this.$search, list: this, search: this.options.search});
            this.searchView.on('search', function(query) {
                console.log(query);
                var filterFunc = self.getCombinedFilterFunc();
                var filterObj = self.getCombinedFilterObj();
                var loadObj = self.getCombinedLoadObj();
                self.filter(filterFunc, filterObj, loadObj);
            });
        }
        
        this.paginationView = new ListPagination({el: this.$pager, list: this});
    },
    debouncedMasonReload: _.debounce(function(e) {
        this.masonReload(e);
    }, 300),
    masonReload: function() {
        if(this.mason) {
            this.mason.reloadItems();
            this.mason.layout();
        }
    },
    requireMasonAndInit: function(callback) {
        var self = this;
        if(self.mason) {
            self.mason.destroy();
            delete self.mason;
        }
        require(['/desktop/js/masonry.pkgd.min.js'], function(Masonry){
            self.mason = new Masonry( self.$ul[0], {
                columnWidth: 333,
                itemSelector: '.fileAvatar'
            });
            // self.mason.on( 'layoutComplete', function( msnryInstance, laidOutItems ) {
            //     console.log(arguments)
            // });
            // self.mason.on( 'removeComplete', function( msnryInstance, removedItems ) {
            //     console.log(arguments)
            // });
            if(callback) {
                callback();
            }
        });
    },
    removeMason: function() {
        if(this.mason) {
            this.mason.destroy();
            delete this.mason;
        }
    },
    getCombinedLoadObj: function() {
        var loadObj = {};
        if(this.filterView && this.filterView.selectedFilter) {
            loadObj = this.filterView.options.filters[this.filterView.selectedFilter].load;
            console.log(loadObj);
        }
        if(this.tagsView && this.tagsView.tagSelectView.selectedTag) {
            loadObj[this.tagsView.fieldName] = this.tagsView.tagSelectView.selectedTag.get('name');
        }
        if(this.searchView && this.searchView.selectedQuery) {
            loadObj[this.searchView.fieldName] = "/"+this.searchView.selectedQuery+"/";
        }
        console.log(loadObj);
        return loadObj;
    },
    getCombinedFilterObj: function() {
        var filterObj = {};
        if(this.filterView && this.filterView.selectedFilter) {
            filterObj.filter = this.filterView.selectedFilter;
        }
        if(this.tagsView && this.tagsView.tagSelectView.selectedTag) {
            filterObj.tag = this.tagsView.tagSelectView.selectedTag.get('name');
        }
        if(this.searchView && this.searchView.selectedQuery) {
            filterObj.search = this.searchView.selectedQuery;
        }
        return filterObj;
    },
    getCombinedFilterFunc: function() {
        // if(self.filterView.selectedFilter) {
        return function(model, filterObj) {
            if(!this.filterView || this.filterView.getFilterFunc()(model, filterObj)) {
                if(!this.tagsView || this.tagsView.getTagFilterFunc()(model, filterObj)) {
                    if(!this.searchView || this.searchView.getSearchFilterFunc()(model, filterObj)) {
                        return true;
                    }
                }
            }
            return false;
        }
    },
    unbindScroll: function() {
        $(window).off('scroll', this.windowScrollP);
    },
    bindScroll: function() {
        var self = this;
        // TODO when fixed, select element instead of window.
        this.windowScroll = function(){
            var self = this;
            if(self.$el.is(":visible")) {
              if(!self.loading && $(window).scrollTop() + 333 >= $(document).height() - $(window).height()){
                self.loading = true;
                self.loadMore();
              }
            }
        }
        this.windowScrollP = $.proxy(this.windowScroll,this);
        $(window).on('scroll', this.windowScrollP);
    },
    initLayout: function(layout) {
        this.setLayout(layout, false);
    },
    setLayout: function(layout, render) {
        var self = this;
        if (render !== false) {
            render = true;
        }
        var oldLayout = this.layout;
        this.layout = layout;
        //if (this.layout !== oldLayout) {
            if(this.$wrap) {
                this.$wrap.remove();
            }
            // console.log(this.layout)
            if (this.layout == 'table') {
                this.$wrap = $('<table class="houseList table table-striped table-hover"></table>');
                this.$ul = $('<tbody></tbody>');
                this.$wrap.append(this.$ul);
                self.removeMason();
            } else if (this.layout == 'avatar') {
                this.$wrap = this.$ul = $('<div class="houseList" style="position: relative;"></div>');
                self.requireMasonAndInit();
            } else if (this.layout == 'row') {
                this.$wrap = this.$ul = $('<ul class="houseList list-unstyled"></ul>');
                self.removeMason();
            } else {
                self.removeMason();
            }
        //}
        this.$el.append(this.$wrap);
        if (render) {
            this.renderPage(this.currentPage);
        }
    },
    getCollectionFiltered: function() {
        var self = this;
        if(self.currentFilter) {
            self.searchResults = self.collection.filter(function(model) {
                if (self.currentFilter(model, self.currentFilterId)) {
                    return true;
                }
                return false;
            });
            
            return self.searchResults;
        } else {
            return self.collection.filter(function(){
                return true;
            });
        }
    },
    filter: function(f, id, load) {
        var self = this;
        if(load) {
            this.searchLoad = load;
        } else {
            delete this.searchLoad;
        }
        if (f && typeof f == 'function') {
            this.currentFilter = f;
            this.currentFilterId = id;
            // self.searchResults = this.collection.filter(function(model) {
            //     // console.log(id)
            //     if (f(model, id)) {
            //         //self.getDocLayoutView(model).$el.show();
            //         return true;
            //     }
            //     //self.getDocLayoutView(model).$el.hide();
            //     return false;
            // });
            
            // this.searchLoad.skip = s;
            console.log(this.searchLoad)
            // this.collection.refreshCount(this.searchLoad);
            var self = this;
            var headCountOpts = _.clone(this.searchLoad);
            // delete headCountOpts.skip;
            this.collection.headCount(headCountOpts, function(count) {
                self.searchCount = count;
                self.trigger('count', count);
                self.collection.load(self.searchLoad, function(){
                    // self.searchResults = self.collection.filter(function(model) {
                    //     // console.log(id)
                    //     if (f(model, id)) {
                    //         //self.getDocLayoutView(model).$el.show();
                    //         return true;
                    //     }
                    //     //self.getDocLayoutView(model).$el.hide();
                    //     return false;
                    // });
                    self.getCollectionFiltered();
                    console.log(self.searchResults)
                    console.log(self.searchResults.length)
                    self.renderPage(1);
                    self.renderPagination();
                });
            });
            
        } else {
            self.currentFilter = false;
            delete self.searchResults;
            self.getCollectionFiltered();
            self.renderPage(1);
            self.renderPagination();
        }
    },
    search: function(q, callback) {
        var searchField = 'title';
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
                return regex.test(e.get(searchField));
            });
            self.renderPage(1);
            self.renderPagination();

            if (callback) {
                callback();
            }
        });
    },
    events: {
    },
    setPageSize: function(pageSize) {
        if(pageSize === 0) {
            this.bindScroll();
        } else {
            this.unbindScroll();
        }
        this.pageSize = pageSize;
        this.collection.pageSize = pageSize;
    },
    loadMore: function(callback) {
        var self = this;
        if (this.searchResults) {
            this.collection.loadSkip(this.searchResults.length, function() {
                self.loading = false;
                self.getCollectionFiltered();
                self.renderPagination();
                if(callback) {
                    callback();
                }
            });
        } else {
            this.collection.getNextPage(function() {
                self.loading = false;
                if(callback) {
                    callback();
                }
            });
        }
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
    renderLoading: function(isLoading) {
        if(isLoading === false) {
            this.$el.removeClass('loading');
            this.$el.find('.pageSizes button').removeClass('disabled');
            // this.renderPagination();
        } else {
            this.$el.addClass('loading');
            this.$el.find('.pageSizes button').addClass('disabled');
            // this.$el.find('.pageSizes button').html('...')
        }
    },
    renderPagination: function() {
        this.paginationView.render();
    },
    renderPage: function(pageNum) {
        if(typeof pageNum !== 'number') {
            pageNum = parseInt(pageNum, 10);
        }
        var self = this;
        this.$ul.html('');
        this.currentPage = pageNum; //
        this.renderPagination();
        // if(this.pagesLength < this.currentPage) {
        //     this.currentPage = this.pagesLength;
        //     console.log(pageNum)
        //     this.renderPage(pageNum);
        //     return;
        // } else if(pageNum < 1) {
        //     pageNum = 1;
        // }
        console.log(this.pageSize)
        var s = (this.currentPage - 1) * this.pageSize;
        var col = this.searchResults ? this.searchResults : this.collection;
        var l = col.length;
        if (col.count) {
            l = col.count;
        }
        var returnSlice = function() {
            self.getCollectionFiltered();
            var e = (l < (s + self.pageSize)) ? l : (s + self.pageSize);
            if(self.pageSize === 0) {
                s = 0;
                e = col.length;
            }
            col.slice(s, e).forEach(function(doc, i, c) {
                //console.log(arguments)
                var view = self.getDocLayoutView(doc);
                self.appendRow(view);
                // self.renderPagination();
                doc.on('remove', function() {
                    view.$el.remove();
                    return false;
                });
            });
            
            if(self.mason) {
                self.mason.reloadItems();
                self.mason.layout();
            }
        }
            // alert(s)
        if (col.length <= s + this.pageSize) {
            if(col.load) {
                col.load({
                    skip: s
                }, returnSlice);
            } else if(this.searchLoad) {
                // this.searchLoad.skip = s;
                // console.log(this.searchLoad)
                // // this.collection.refreshCount(this.searchLoad);
                // var self = this;
                // var headCountOpts = _.clone(this.searchLoad);
                // delete headCountOpts.skip;
                // this.collection.headCount(headCountOpts, function(count) {
                //     self.searchCount = count;
                //     self.trigger('count', count);
                //     self.collection.load(self.searchLoad, returnSlice);
                // });
                self.collection.loadSkip(s, returnSlice);
            }
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
        
        if(this.searchView) {
            this.searchView.render();
        }
        if(this.filterView) {
            this.filterView.render();
        }
        if(this.tagsView) {
            this.tagsView.render();
        }
        if(this.sortView) {
            this.sortView.render();
        }
        if(this.layoutView) {
            this.layoutView.render();
        }
        if(this.selectionView) {
            this.selectionView.render();
        }
        
        //this.collection.sort({silent:true});
        this.collection.each(function(doc) {
            var view = self.getDocLayoutView(doc);
            self.appendRow(view);
        });
        this.renderPagination();
        
        if(this.options.headerEl) {
        } else {
            this.$el.prepend(this.$header);
        }
        this.$el.append(this.$footer);
        
        if(this.layout === 'avatar') {
            if(!this.mason) {
                self.requireMasonAndInit(function(){
                    self.mason.layout();
                });
            } else {
                self.requireMasonAndInit();
            }
        }
        
        this.setElement(this.$el);
        return this;
    },
    getModelSortRank: function(model) {
        var endStr = this.collection.sortField.substr(this.collection.sortField.length - 1);
        var sortField = this.collection.sortField;
        if (endStr === '-') {
            sortField = this.collection.sortField.substr(0, this.collection.sortField.length - 1);
        }
        var rankFieldValue = model.get(sortField);
        if(sortField === 'at') {
            rankFieldValue = new Date(rankFieldValue).getTime();
            if (endStr === '-') {
                return rankFieldValue;
            }
            return rankFieldValue * -1;
        } else if(sortField === 'views') {
            if (endStr === '-') {
                return rankFieldValue;
            }
            return rankFieldValue * -1;
        } else if(sortField === 'uploadDate') {
            rankFieldValue = new Date(rankFieldValue).getTime();
            if (endStr === '-') {
                return rankFieldValue;
            }
            return rankFieldValue * -1;
        } else {
            for(var i in this.options.sorts) {
                var sort = this.options.sorts[i];
                if(sort.field && sort.field === sortField) {
                    if(sort.type) {
                        if(sort.type === 'date') {
                            rankFieldValue = new Date(rankFieldValue).getTime();
                            if (endStr === '-') {
                                return rankFieldValue;
                            }
                            return rankFieldValue * -1;
                        }
                    }
                }
            }
        }
        if (endStr === '-') {
            return rankFieldValue;
        }
        return rankFieldValue * -1;
    },
    appendRow: function(row) {
        //console.log(row.model)
        var self = this;
        var rank = this.getModelSortRank(row.model);
        var rowEl = row.render().$el;
        if (this.currentFilter && this.currentFilterId && !this.currentFilter(row.model, this.currentFilterId)) {
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
        if(this.mason) {
            this.mason.appended(rowEl);
            rowEl.find('img').one('load', function(){
                if(self.mason) {
                    self.mason.layout();
                }
            });
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
