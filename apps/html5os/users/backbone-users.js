(function() {
    
    var Model = Backbone.Model.extend({
        collectionName: "users",
        initialize: function(attr, opts) {
            var self = this;
            var timestamp = this.id.toString().substring(0,8)
            var date = new Date( parseInt( timestamp, 16 ) * 1000 )
            this.attributes.at = date;
            this.on("change", function(model, options){
                //console.log(arguments);
            });
            this.views = {};
        },
        getOwner: function(callback) {
            if(this.has('owner')) {
                var owner = this.get('owner');
                var user = window.usersCollection.getOrFetch(owner.id, callback);
            }
        },
        getFullView: function(options) {
            options = options || {};
            options.model = this;
            if (!this.fullView) {
                var view = this.fullView = new FullView(options);
                view.on('goToProfile', function(model){
                    options.list.trigger('goToProfile', model);
                });
                this.views.fullView = view;
            }
            return this.fullView;
        },
        getWelcomeView: function(options) {
            console.log(options)
            options = options || {};
            options.model = this;
            if (!this.welcomeView) {
                var view = this.welcomeView = new WelcomeView(options);
                view.on('goToProfile', function(model){
                    options.list.trigger('goToProfile', model);
                });
                this.views.welcomeView = view;
            }
            return this.welcomeView;
        },
        getAvatar: function(options) {
            options = options || {};
            options.model = this;
            if (!this.avatar) {
                var view = this.avatar = this.getNewAvatarNameView(options);
                this.views.avatar = view;
            }
            return this.avatar;
        },
        getAvatarView: function(options) {
            return this.getAvatar(options);
        },
        getNewAvatarNameView: function(options) {
            if (!options) options = {};
            options.model = this;
            return new AvatarNameView(options)
        },
        getAvatarNameView: function(options) {
            if (!options) options = {};
            options.model = this;
            if (!this.hasOwnProperty("avatarNameView")) {
                this.avatarNameView = this.getNewAvatarNameView(options);
            }
            return this.avatarNameView;
        },
        getUserView: function(options) {
            return this.getFullView(options);
        },
        getRow: function(options) {
            options = options || {};
            options.model = this;
            if (!this.row) {
                var row = this.row = new RowView(options);
                this.views.row = row;
            }
            return this.row;
        },
        renderViews: function() {
            for(var i in this.views) {
                this.views[i].render();
            }
        },
        slugStr: function(str) {
            return str.toLowerCase().replace(/ /gi, '-');
        },
        setSlug: function(slug) {
            this.set('slug', this.slugStr(slug));
        },
        getNavigatePath: function() {
            if(this.has('name')) {
                return this.get('name');
            } else {
                return 'user/'+this.id;
            }
        }
    });
    
    var Collection = Backbone.Collection.extend({
        model: Model,
        collectionName: 'users',
        url: '/api/users',
        initialize: function() {
            var self = this;
            self.pageSize = 10;
            this.resetFilters();
            
            require(['/desktop/socket.io.min.js'], function() {
                var socketOpts = {};
                if(window.location.protocol.indexOf('https') !== -1) {
                    socketOpts.secure = true;
                } else {
                    socketOpts.secure = false;
                }
                var socket = self.io = io.connect('//'+window.location.host+'/socket.io/io', socketOpts);
                if(socket.socket.connected) {
                    //console.log('already connected and now joining '+self.collectionName);
                    socket.emit('join', self.collectionName);
                }
                socket.on('connect', function(data) {
                    //console.log('connected and now joining '+self.collectionName);
                    socket.emit('join', self.collectionName);
                });
                var insertOrUpdateDoc = function(doc) {
                        //console.log(doc);
                    if(_.isArray(doc)) {
                        _.each(doc, insertOrUpdateDoc);
                        return;s
                    }
                    var model = self.get(doc.id);
                    if(!model) {
                        var model = new self.model(doc);
                        self.add(model);
                    } else {
                        //console.log(model);
                        model.set(doc, {silent:true});
                        model.renderViews();
                    }
                }
                socket.on('insertedUsers', function(doc) {
                    //console.log('inserted user');
                    insertOrUpdateDoc(doc);
                    self.count++;
                    self.trigger('count', self.count);
                });
                socket.on('updatedUsers', function(doc) {
                    insertOrUpdateDoc(doc);
                });
                socket.on('deletedUsers', function(id) {
                    self.remove(id);
                    self.count--;
                    self.trigger('count', self.count);
                });
                
                self.initialized = true;
                self.trigger('initialized');
            });
        },
        headCount: function(callback) {
            var self = this;
            var aj = $.ajax({type: "HEAD",url: self.url,data: {},
                complete: function(json) {
                    callback(aj.getResponseHeader('X-Count'));
                },xhrFields: {withCredentials: true}
            });
        },
        refreshCount: function() {
            var self = this;
            self.headCount(function(count){
                self.count = count;
                self.trigger('count', count);
            });
        },
        load: function(options, success) {
            var self = this;
            if(!this.count) {
                this.refreshCount();
            }
            if(!options) {
                options = {};
            }
            if(!options.limit) {
                options.limit = self.pageSize;
            }
            if(!options.sort) {
                options.sort = "at-";
            }
            this.applyFilters(options);
            return this.fetch({data: options, update: true, remove: false, success: function(collection, response){
                    if(success) {
                        success();
                    }
                },
                error: function(collection, response){
                }
            });
        },
        getNextPage: function(callback) {
            if(this.length < this.count) {
                this.load({skip:this.length}, callback);
            }
        },
        applyFilters: function(options) {
            
        },
        updateFilter: function(filter) {
            this.reset();
            this.load();
        },
        comparator: function(doc) {
            var d;
            if(doc.get("at")) {
                d = new Date(doc.get("at")).getTime();
                return d * -1;
            } else {
                return 1;
            }
        },
        resetFilters: function() {
        },
        getOrFetch: function(id, callback) {
            var self = this;
            if(!this.fetchingId) {
                this.fetchingId = {};
            }
            if(this.fetchingId.hasOwnProperty(id) && this.fetchingId[id]) {
                this.once('fetchedId:'+id, function(doc){
                    if(doc) {
                        callback(doc);
                    } else {
                        //self.getOrFetchUrl(url, callback);
                        callback(false);
                    }
                });
                return;
            }
            this.fetchingId[id] = true;
            var doc;
            doc = this.get(id);
            if(doc) {
                delete self.fetchingId[id];
                callback(doc);
                self.trigger('fetchedId:'+id, doc);
            } else {
                var options = { "id": id };
                this.fetch({data: options, update: true, remove: false, success: function(collection, response){
                        delete self.fetchingId[id];
                        if(response) {
                            doc = self.get(id);
                            callback(doc);
                            self.trigger('fetchedId:'+id, doc);
                        } else {
                            callback(false);
                            self.trigger('fetchedId:'+id);
                        }
                    },
                    error: function(collection, response){
                        callback(false);
                    }
                });
            }
        },
        getOrFetchName: function(slug, callback) {
            var self = this;
            var doc;
            doc = _.first(this.where({name:slug}));
            if(doc) {
                callback(doc);
            } else {
                var options = { "name": slug };
                this.fetch({data: options, update: true, remove: false, success: function(collection, response){
                        if(response) {
                            doc = _.first(self.where({name:slug}));
                            callback(doc);
                        } else {
                            callback(false);
                        }
                    },
                    error: function(collection, response){
                        callback(false);
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
                this.view.on("selected", function(m) {
                    self.trigger("selected", m);
                });
            }
            return this.view;
        }
    });
    
    var ListView = Backbone.View.extend({
        layout: 'row',
        initialize: function() {
            var self = this;
            self.loading = false;
            this.$pager = $('<div class="list-pager">showing <span class="list-length"></span> of <span class="list-count"></span> users</div>');
            var $ul = this.$ul = $('<ul class="images"></ul>');
            this.collection.on('add', function(doc) {
                var view;
                if(self.layout === 'row') {
                    view = doc.getRow({list: self});
                } else if(self.layout === 'avatar') {
                    view = doc.getAvatar({list: self});
                }
                self.appendRow(view);
                self.renderPager();
                doc.on('remove', function(){
                    view.$el.remove();
                    return false;
                });
            });
            this.collection.on('remove', function(doc, col, options) {
                self.renderPager();
            });
            this.collection.on('count', function() {
                self.renderPager();
            });
            this.collection.on('reset', function(){
                self.render();
            });
            
            $(window).scroll(function(){
                if(self.$el.is(":visible")) {
                  if(!self.loading && $(window).scrollTop() + 250 >= $(document).height() - $(window).height()){
                    self.loading = true;
                    self.loadMore();
                  }
                }
            });
        },
        filter: function(f) {
            var self = this;
            if(f && typeof f == 'function') {
                this.currentFilter = f;
                this.collection.filter(function(model) {
                  if(f(model)) {
                      self.getDocLayoutView(model).$el.show();
                      return true;
                  }
                  self.getDocLayoutView(model).$el.hide();
                  return false;
                });
            } else {
                // show all
                self.$ul.children().show();
                self.currentFilter = false;
            }
        },
        events: {
          "click .list-pager": "loadMore"
        },
        loadMore: function() {
            var self = this;
            this.collection.getNextPage(function(){
                self.loading = false;
            });
        },
        getDocLayoutView: function(doc) {
            var view;
            if(this.layout === 'row') {
                view = doc.getRow({list: this});
            } else if(this.layout === 'avatar') {
                view = doc.getAvatar({list: this});
            }
            return view;
        },
        render: function() {
            var self = this;
            this.$el.html('');
            this.$el.append(this.$ul);
            this.$ul.html('');
            //this.collection.sort({silent:true});
            this.collection.each(function(doc){
                var view = self.getDocLayoutView(doc);
                self.appendRow(view);
            });
            this.$el.append(this.$pager);
            this.renderPager();
            this.trigger('resize');
            this.setElement(this.$el);
            return this;
        },
        renderPager: function() {
            var len = this.collection.length;
            var c = this.collection.count > len ? this.collection.count : len;
            this.$pager.find('.list-length').html(len);
            this.$pager.find('.list-count').html(c);
        },
        appendRow: function(row) {
            var rank = new Date(row.model.get('at'));
            rank = rank.getTime();
            var rowEl = row.render().$el;
            if(this.currentFilter && !this.currentFilter(row.model)) {
                rowEl.hide();
            }
            rowEl.attr('data-sort-rank', rank);
            var d = false;
            var $lis = this.$ul.children();
            var last = $lis.last();
            var lastRank = parseInt(last.attr('data-sort-rank'), 10);
            if(rank > lastRank) {
                $lis.each(function(i,e){
                    if(d) return;
                    var r = parseInt($(e).attr('data-sort-rank'), 10);
                    if(rank > r) {
                        $(e).before(rowEl);
                        d = true;
                    }
                });
            }
            if(!d) {
                this.$ul.append(rowEl);
            }
        }
    });
    
    
    var ActionsView = Backbone.View.extend({
        tagName: "span",
        className: "actions",
        render: function() {
            var self = this;
            this.$el.html('');
            //self.$el.append(this.tagsView.render().$el);
            //self.$el.append(this.groupsView.render().$el);
            //self.$el.append(this.editView.render().$el);
            //self.$el.append(this.deleteView.render().$el);
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
            this.actions = [];
            //this.groupsView = new GroupsView({id: this.id, model: this.model});
            //this.tagsView = new TagsView({id: this.id, model: this.model});
            //this.deleteView = new ActionDeleteView({id: this.id, model: this.model});
            //this.editView = new ActionEditView({id: this.id, model: this.model});
        }
    });

    var ActionFeedView = Backbone.View.extend({
        tagName: "span",
        className: "feed",
        render: function() {
            if(!this.model.has('feed')) {
                this.$el.html('<button class="publish">publish to feed</button>');
            } else {
                var feed = this.model.get('feed');
                this.$el.html('published at <a href="/feed/item/'+feed.id+'" target="_new">'+feed.at+'</a><button class="unpublish">remove from feed</button>');
            }
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
        },
        events: {
          "click .publish": "publish",
          "click .unpublish": "unpublish"
        },
        publish: function() {
            var self = this;
            //console.log(this.model);
            this.model.set({"feed": 0},{silent: true});
            var saveModel = this.model.save(null, {
                silent: false,
                wait: true
            });
            saveModel.done(function() {
                self.render();
            });
            return false;
        },
        unpublish: function() {
            var self = this;
            //console.log(this.model);
            this.model.unset("feed", {silent: true});
            var saveModel = this.model.save(null, {
                silent: false,
                wait: true
            });
            saveModel.done(function() {
                self.render();
            });
            return false;
        }
    });

    var ActionDeleteView = Backbone.View.extend({
        tagName: "span",
        className: "delete",
        render: function() {
            this.$el.html('<button>delete</button>');
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
        },
        events: {
          "click button": "select"
        },
        select: function() {
            var self = this;
            if(confirm("Are you sure that you want to delete this user?")) {
                this.model.destroy({success: function(model, response) {
                  window.history.back(-1);
                }, 
                errorr: function(model, response) {
                    //console.log(arguments);
                },
                wait: true});
            }
            return false;
        }
    });
    
    var ActionEditView = Backbone.View.extend({
        tagName: "span",
        className: "edit",
        render: function() {
            this.$el.html('<button>edit</button>');
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
        },
        events: {
          "click button": "select"
        },
        select: function() {
            var self = this;
            
             this.model.collection.trigger('editModel', this.model);
            
            return false;
        }
    });
    
    var TagsView = Backbone.View.extend({
        tagName: "span",
        className: "tags",
        render: function() {
            this.$el.html('');
            var tags = this.model.get("tags");
            if(tags) {
                for(var i in tags) {
                    var tagName = tags[i];
                    if(!_.isString(tagName)) {
                        var $btn = $('<button class="tag">'+tagName+'</button>');
                        $btn.attr('data-tag', JSON.stringify(tagName));
                        this.$el.append($btn);
                    } else {
                        this.$el.append('<button class="tag">'+tagName+'</button>');
                    }
                }
            }
            this.$el.append('<button class="newTag">+ tag</button>');
            this.$el.removeAttr('id');
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
        },
        events: {
          "click .newTag": "newTag",
          "click .tag": "removeTag"
        },
        removeTag: function(e) {
            var self = this;
            if(confirm("Are you sure that you want to remove this tag?")) {
                var tags = this.model.get("tags");
                var $tag = $(e.target);
                var tagName = '';
                if($tag.attr('data-tag')) {
                    tagName = JSON.parse($tag.attr('data-tag'));
                } else {
                    tagName = e.target.innerHTML;
                }
                this.model.pull({"tags": tagName}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
        },
        newTag: function() {
            var self = this;
            var tagName = prompt("Enter tags, separated, by commas.");
            if(tagName) {
                tagName = tagName.split(',');
                for(var i in tagName) {
                    var tag = tagName[i];
                    tagName[i] = tag.trim(); // trim extra white space
                }
                if(tagName) {
                    if(!this.model.has("tags")) {
                        this.model.set({'tags': tagName}, {silent: true});
                        var saveModel = this.model.save(null, {
                            silent: false,
                            wait: true
                        });
                        saveModel.done(function() {
                            //console.log('tags saved');
                        });
                    } else {
                        this.model.pushAll({"tags": tagName}, {silent: true});
                        var saveModel = this.model.save(null, {
                            silent: false,
                            wait: true
                        });
                        saveModel.done(function() {
                            self.render();
                        });
                    }
                }
            }
        }
    });

    var GroupsView = Backbone.View.extend({
        tagName: "span",
        className: "groups",
        initialize: function() {
        },
        render: function() {
            this.$el.html('');
            var groups = this.model.get("groups");
            if(groups) {
                for(var i in groups) {
                    var groupName = groups[i];
                    this.$el.append('<button class="group">'+groupName+'</button>');
                }
                if(groups.indexOf('public') === -1) {
                    this.$el.append('<button class="publicGroup">+ public</button>');
                }
                if(groups && groups.length > 0) {
                    this.$el.append('<button class="privateGroup">+ private</button>');
                }
            }
            this.$el.append('<button class="newGroup">+ group</button>');
            this.$el.removeAttr('id');
            this.setElement(this.$el);
            return this;
        },
        events: {
          "click .newGroup": "newGroup",
          "click .group": "removeGroup",
          "click .publicGroup": "publicGroup",
          "click .privateGroup": "privateGroup"
        },
        privateGroup: function() {
            var self = this;
            if(confirm("Are you sure that you want to make this private?")) {
                this.model.set({"groups": []}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
        },
        publicGroup: function() {
            var self = this;
            if(confirm("Are you sure that you want to make this public?")) {
                this.model.push({"groups": "public"}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
        },
        removeGroup: function(e) {
            var self = this;
            if(confirm("Are you sure that you want to remove this group?")) {
                var groups = this.model.get("groups");
                var name = e.target.innerHTML;
                this.model.pull({"groups": name}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
        },
        newGroup: function() {
            var self = this;
            var groupName = prompt("Enter groups, separated, by commas.");
            if(groupName) {
                groupName = groupName.split(',');
                
                for(var i in groupName) {
                    var g = groupName[i];
                    groupName[i] = g.trim(); // trim extra white space
                }
                if(groupName) {
                    if(!this.model.get("groups")) {
                        this.model.set({'groups': groupName}, {silent: true});
                    } else {
                        this.model.pushAll({"groups": groupName}, {silent: true});
                    }
                    var saveModel = this.model.save(null, {
                        silent: false,
                        wait: true
                    });
                    saveModel.done(function() {
                        self.render();
                    });
                }
            }
        }
    });
    
    var AvatarNameView = Backbone.View.extend({
        tagName: "span",
        className: "avatarName",
        initialize: function(options) {
            var defaultImg = '';
            if(options.defaultImg) {
                defaultImg = options.defaultImg;
            } else {
                defaultImg = '/users/iosicon.png';
            }
            this.$span = $('<span class="userAvatarName"><span class="name"></span></span>');
            this.$img = $('<img class="avatar" src="'+defaultImg+'">');
            // console.log(this.$img)
            this.$span.append(this.$img);
        },
        render: function() {
            var self = this;
            this.$el.html(this.$span);
            this.$span.find('.name').html(this.model.get('name'));
            this.$img.attr('title', this.model.get('name'));
            if (this.model.has("avatar")) {
                var src = this.model.get("avatar");
                if (src.indexOf("http") === 0) {} else {
                    src = "/api/files/" + encodeURIComponent(src);
                }
                if(this.$img.attr('src') !== src) {
                    this.$img.attr('src', src);
                }
            }
            this.setElement(this.$el);
            return this;
        },
        events: {
            click: "goToProfile"
        },
        goToProfile: function() {
            this.trigger("goToProfile", this.model);
        },
        remove: function() {
            this.$el.remove();
        }
    });

    var RowView = Backbone.View.extend({
        tagName: "li",
        className: "row",
        initialize: function(options) {
            if(options.list) {
                this.list = options.list;
            }
            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
            //this.actions = new ActionsView({id: this.id, model: this.model});
        },
        render: function() {
            this.$el.html('');
            var $byline = $('<span class="byline"></span>');
            this.$el.append('<span class="avatar"></span>');
            if (this.model.has("avatar") && this.model.get("avatar")) {
                var src = this.model.get("avatar");
                if (typeof src == 'string') {
                } else if(src.hasOwnProperty('url')) {
                    src = src.url;
                }
                if (src.indexOf("http") === 0) {
                    
                } else {
                    src = "/api/files/" + src;
                }
                this.$el.find('.avatar').append('<img src="' + src + '" />');
            }
            if(this.model.has('name')) {
                this.$el.append('<strong class="name">'+this.model.get('name')+'</strong>');
                if(this.model.has('displayName')) {
                    this.$el.append('<span class="displayName">'+this.model.get('displayName')+'</span>');
                }
            }
            if(this.model.has('at')) {
                var $at = $('<span class="at"></span>');
                if(window.clock) {
                    $at.attr('title', clock.moment(this.model.get('at')).format('LLLL'));
                    $at.html(clock.moment(this.model.get('at')).calendar());
                } else {
                    $at.html(this.model.get('at'));
                }
                $byline.append($at);
            }
            if(this.model.has('groups')) {
                this.$el.append('<span class="groups">'+this.model.get('groups')+'</span>');
            }
            this.$el.append($byline);
            this.$el.attr('data-id', this.model.get("id"));
            //this.$el.append(this.actions.render().$el);
            this.setElement(this.$el);
            return this;
        },
        events: {
          "click": "select"
        },
        select: function(e) {
            var deselectSiblings = function(el) {
                el.siblings().removeClass('selected');
                el.siblings().removeAttr('selected');
            }
            deselectSiblings(this.$el);
            this.$el.addClass("selected");
            this.$el.attr("selected", true);
            if(this.hasOwnProperty('list')) {
                this.list.trigger('select', this);
            }
            this.trigger('select');
            this.trigger('resize');
        },
        remove: function() {
          $(this.el).remove();
        }
    });
    var FullView = Backbone.View.extend({
        tagName: "div",
        className: "fullView",
        initialize: function(options) {
            var self = this;
            if(options.list) {
                this.list = options.list;
            }
            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
            this.actions = new ActionsView({id: this.id, model: this.model});
        },
        render: function() {
            var self = this;
            this.$el.html('');
            var $byline = $('<span class="membership"></span>');
            var displayName = this.model.get('displayName') || this.model.get('name');
            this.$el.append('<h1 class="displayName">'+displayName+'</h1>');
            this.$el.append('<h2 class="name">'+this.model.get('name')+'</h2>');
            
            this.$el.append('<span class="avatar"></span>');
            if (this.model.has("avatar") && this.model.get("avatar")) {
                var src = this.model.get("avatar");
                if (typeof src == 'string') {
                } else if(src.hasOwnProperty('url')) {
                    src = src.url;
                }
                if (src.indexOf("http") === 0) {
                    
                } else {
                    src = "/api/files/" + src;
                }
                this.$el.find('.avatar').append('<img src="' + src + '" />');
            }
            
            if(window.account) {
                account.isAdmin(function(isAdmin){
                    var isa = (isAdmin || account.isOwner(self.model.id));
                    if(isa) {
                        self.$el.find('h1').html('<a class="editDisplayName" title="Edit display name" href="#">'+self.$el.find('h1').html()+'</a>');
                        self.$el.find('h2').html('<a class="editName" title="Edit user name" href="#">'+self.$el.find('h2').html()+'</a>');
                        
                        var $setPass = $('<div class="inputPass">\n\
                            <a href="/" class="showPassForm zocial guest">Set Password</a>\n\
                            <form style="display: none">\n\
                                <span class="passwordOnce form-group">\n\
                                    <label>Password: </label>\n\
                                    <input class="form-control" type="password" name="pass" tabindex=1 />\n\
                                </span>\n\
                                <span class="passwordAgain form-group" style="display: none">\n\
                                    <label>Your password again: </label>\n\
                                    <input type="password" name="pass_again" class="form-control" tabindex=2 />\n\
                                </span>\n\
                            </form></div>');
                        
                        self.$el.find('.avatar').append('<br /><a class="editAvatar" title="Upload avatar" href="#">upload avatar</a><br />');
                        
                        self.$el.append('<span class="groups"></span>');
                        if(self.model.has('groups')) {
                            var groups = self.model.get('groups');
                            for(var g in groups) {
                                var group = groups[g];
                                if(isAdmin) {
                                    self.$el.find('.groups').append('<a href="#" class="removeGroup" data-group="'+group+'" title="Remove group">'+group+'</a>');
                                } else {
                                    self.$el.find('.groups').append('<span class="group">'+group+'</span>');
                                }
                            }
                        } else {
                            
                        }
                        if(isAdmin) {
                            self.$el.find('.groups').append('<a href="#" class="addGroup" title="Add group">add group</a>');
                        }
                    }
                    if (self.model.has("url") || isa) {
                        var src = self.model.get("url") || 'http://yourwebsite.com/';
                        self.$el.append(' <span class="url"><a href="'+src+'" target="_new">' + src + '</a></span>');
                        if(isa) {
                            self.$el.find('.url').append(' <a class="editUrl" title="Edit web address" href="#">edit</a>');
                        }
                    }
                    
                    if(!account.isOwner(self.model.id)) {
                        self.$el.append('<button class="sendMsg">Send Message</button>');
                    }
                    
                    if(self.model.has('at')) {
                        var $at = $('<span class="at"></span>');
                        if(window.clock) {
                            $at.attr('title', clock.moment(self.model.get('at')).format('LLLL'));
                            $at.html(clock.moment(self.model.get('at')).calendar());
                        } else {
                            $at.html(self.model.get('at'));
                        }
                        $byline.append(' member since ');
                        $byline.append($at);
                    }
                    var $msg = $('<div class="email"></div>');
                    if(self.model.has('email')) {
                        $msg.html(self.model.get('email'));
                    }
                    self.$el.append($msg);
                    if(isa) {
                        $msg.append(' <a class="editEmail" title="Edit email address" href="#">edit email</a>');
                    }
                    
                    if(account.isOwner(self.model.id)) {
                        self.$el.append('<a class="editPass" title="Edit user password" href="#">change password</a><br />');
                    }
                    
                    
                    self.$el.append($byline);
                    
                    var $loc = $('<div class="location"></div>');
                    if(self.model.has('location')) {
                        $loc.html(self.model.get('location'));
                    }
                    self.$el.append($loc);
                    
                    var $bio = $('<div class="bio"></div>');
                    if(self.model.has('bio')) {
                        $bio.html(self.model.get('bio'));
                    }
                    self.$el.append($bio);
                    
                    if(account.SubProfileView) {
                        if(!self.subProfileView) {
                            self.subProfileView = new account.SubProfileView({model: self.model});
                        }
                        self.$el.append(self.subProfileView.render().$el);
                    }
                    
                    if(isa) {
                        self.$el.append(self.actions.render().$el);
                    }
                });
            } else {
            }
            
            
            this.trigger('resize');
            this.setElement(this.$el); // hmm - needed this to get click handlers //this.delegateEvents(); // why doesn't this run before
            return this;
        },
        renderActions: function() {
            this.actions.render();
        },
        show: function() {
            this.$el.show();
        },
        events: {
            "click .editEmail": "editEmail",
            "click .editName": "editName",
            "click .editPass": "editPass",
            "click .editDisplayName": "editDisplayName",
            "click .editUrl": "editUrl",
            "click .editAvatar": "editAvatar",
            "click .sendMsg": "sendMsg",
            "click .removeGroup": "removeGroup",
            "click .addGroup": "addGroup"
        },
        removeGroup: function(e) {
            var self = this;
            if(confirm("Are you sure that you want to remove this group?")) {
                var groups = this.model.get("groups");
                var name = e.target.innerHTML;
                this.model.pull({"groups": name}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
            return false;
        },
        addGroup: function() {
            var self = this;
            var groupName = prompt("Enter group name");
            if(groupName) {
                this.model.push({"groups": groupName}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
            return false;
        },
        sendMsg: function() {
            var self = this;
            require(['/msgs/msgs.js'], function(MsgsBackbone){
                if(!window.MsgsBackbone) {
                    window.MsgsBackbone = MsgsBackbone;
                }
                if(!window.msgsCollection) {
                    window.msgsCollection = new MsgsBackbone.Collection(); // collection
                }
                var msgOpts = {
                    subjectLabel: "Send a message to "+self.model.get('name')
                };
                if(MsgsBackbone) {
                    self.msgForm = new MsgsBackbone.Form({
                        collection: window.msgsCollection,
                        ui: msgOpts,
                        to: {
                            id: self.model.id,
                            name: self.model.get('name')
                        }
                    });
                    var lightbox = utils.appendLightBox(self.msgForm.render().$el);
                    self.msgForm.on("saved", function(doc) {
                        alert('Thank you for your message!');
                        self.msgForm.clear();
                        lightbox.remove();
                    });
                }
            });
        },
        editPass: function() {
            var self = this;
            var txt = prompt("Enter your current, soon to be old password");
            if(true || txt) {
                var newPass = prompt("Enter a new password");
                var newPassCheck = prompt("And prove that you didn't forget it already");
                if(newPass && newPassCheck && newPass == newPassCheck) {
                    this.model.set({'oldPass': txt, 'pass': newPass}, {silent: true});
                    var saveModel = this.model.save(null, {
                        silent: false ,
                        wait: true
                    });
                    if(saveModel) {
                        saveModel.done(function() {
                            self.render();
                            alert('Password changed.');
                        });
                        saveModel.fail(function(s, typeStr, respStr) {
                            alert('Your password was incorrect');
                        });
                    }
                } else {
                    alert("That didn't take long!");
                }
            }
            return false;
        },
        editEmail: function() {
            var self = this;
            var txt = prompt("Enter your new email address", this.model.get('email'));
            if(txt && txt !== this.model.get('email')) {
                this.model.set({'email': txt}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false ,
                    wait: true
                });
                if(saveModel) {
                    saveModel.done(function() {
                        self.render();
                    });
                    saveModel.fail(function(s, typeStr, respStr) {
                        alert('That email address is already in use.');
                    });
                }
            }
            return false;
        },
        editName: function() {
            var self = this;
            var txt = prompt("Enter your new user name", this.model.get('name'));
            if(txt && txt !== this.model.get('name')) {
                this.model.set({'name': txt}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false ,
                    wait: true
                });
                if(saveModel) {
                    saveModel.done(function() {
                        self.render();
                    });
                    saveModel.fail(function(s, typeStr, respStr) {
                        alert('That username is unavailable.');
                    });
                }
            }
            return false;
        },
        editDisplayName: function() {
            var self = this;
            var d = this.model.get('displayName') || this.model.get('name');
            var txt = prompt("Enter your new display name", d);
            if(txt && txt !== this.model.get('name')) {
                this.model.set({'displayName': txt}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false ,
                    wait: true
                });
                if(saveModel) {
                    saveModel.done(function() {
                        self.render();
                    });
                }
            }
            return false;
        },
        editUrl: function() {
            var self = this;
            var txt = prompt("Enter your URL", this.model.get('url'));
            if(txt && txt !== this.model.get('url')) {
                this.model.set({'url': txt}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false ,
                    wait: true
                });
                if(saveModel) {
                    saveModel.done(function() {
                        self.render();
                    });
                }
            }
            return false;
        },
        editAvatar: function() {
            var self = this;
            if(window.FilesBackbone) {
                self.uploadFrame = new window.FilesBackbone.UploadFrame({collection: window.filesCollection, type:'image', metadata:{groups: ['public']}});
                self.uploadFrame.on('uploaded', function(data){
                    if(_.isArray(data)) {
                        data = _.first(data);
                    }
                    if(data.image) {
                        var setDoc = {
                            image: data.image
                        }
                        var avatar = data.image.filename;
                        if(data.image.sizes) {
                            if(data.image.sizes.thumb) {
                                avatar = data.image.sizes.thumb.filename;
                            }
                        }
                        setDoc.avatar = avatar;
                        self.model.set(setDoc, {silent: true});
                        var saveModel = self.model.save(null, {
                            silent: false,
                            wait: true
                        });
                        if(saveModel) {
                            saveModel.done(function() {
                                self.render();
                                self.uploadFrame.remove();
                            });
                        }
                    }
                });
                this.$el.find('.avatar').append(this.uploadFrame.render().$el);
                self.uploadFrame.pickFiles();
            }
            return false;
        },
        remove: function() {
            $(this.el).remove();
        }
    });
    
    var WelcomeView = Backbone.View.extend({
        tagName: "div",
        className: "welcomeUser",
        initialize: function() {
            var self = this;
            console.log(this.options)
            if(this.options.list) {
                this.list = this.options.list;
            }
            this.ui = {
                regInfoLabel: 'Complete your profile',
                passwordLabel: 'Set a password',
                emailLabel: 'Email Address',
                defaultAvatar: 'Upload a photo'
            }
            this.klasses = {
                "dialog": "dialog",
                "title": "title",
                "header": "header",
                "content": "content",
                "body": "body",
                "footer": "footer"
            }
            if(this.options.modal) {
                this.klasses = {
                    "dialog": "modal-dialog",
                    "title": "modal-title",
                    "header": "modal-header",
                    "content": "modal-content",
                    "body": "modal-body",
                    "footer": "modal-footer"
                }
            }
            for(var i in this.options.ui) {
                this.ui[i] = this.options.ui[i];
            }
            for(var i in this.options.klasses) {
                this.klasses[i] = this.options.klasses[i];
            }
            this.model.bind('change', this.render, this);
        },
        render: function() {
            var self = this;
            //this.$el.addClass(this.klasses.dialog);
            var closeBtn = '';
                console.log(this.options)
            if(this.options.modal) {
                closeBtn = '<button type="button" class="close" data-dismiss="modal" aria-hidden="true">×</button>';
            }
            this.$el.html('<div class="'+this.klasses.dialog+'">\n\
    <div class="'+this.klasses.content+'">\n\
      <div class="'+this.klasses.header+'">'+closeBtn+'\n\
        <h4 class="'+this.klasses.title+'" id="loginModalLabel"></h4>\n\
      </div>\n\
      <div class="'+this.klasses.body+'">\n\
      </div>\n\
      <div class="'+this.klasses.footer+' text-muted">\n\
      </div>\n\
    </div>\n\
</div>');
            this.$body = this.$el.find('.'+this.klasses.body);
            var $byline = $('<span></span>');
            var displayName = this.model.get('displayName') || '';
            this.$el.append('<span class="avatar"></span>');
            if(window.account) {
                account.isAdmin(function(isAdmin){
                    if(isAdmin || account.isOwner(self.model.id)) {
                        self.$body.append('<input class="form-control" title="Edit your display name" class="editDisplayName" type="text" name="displayName" placeholder="Your name" value="'+displayName+'"/>');
                        
                        self.$body.append('<span class="regInfoLabel">'+self.ui.regInfoLabel+'</span>');
                        
                        if(!self.model.has('email')) {
                            var $inputEmail = $('<span class="inputEmail"><button class="connectEmail zocial email">'+self.ui.emailLabel+'</button>\n\
    <input style="display:none;" class="editEmail form-control" type="email" name="email" placeholder="your@email.com" required />\n\
</span>');
                            self.$body.append($inputEmail);
                        }
                        if(self.model.has('pass')) {
                            var $setPass = $('<div class="inputPass">\n\
                                <a href="/" class="showPassForm zocial guest">'+self.ui.passwordLabel+'</a>\n\
                                <form style="display: none">\n\
                                    <span class="passwordOnce form-group">\n\
                                        <label>Password: </label>\n\
                                        <input class="form-control" type="password" name="pass" tabindex=1 />\n\
                                    </span>\n\
                                    <span class="passwordAgain form-group" style="display: none">\n\
                                        <label>Your password again: </label>\n\
                                        <input type="password" name="pass_again" class="form-control" tabindex=2 />\n\
                                    </span>\n\
                                </form></div>');
                            self.$body.append($setPass);
                        }
                    }
                    
                    if (self.model.has("avatar") && self.model.get("avatar")) {
                        var src = self.model.get("avatar");
                        if (typeof src == 'string') {
                        } else if(src.hasOwnProperty('url')) {
                            src = src.url;
                        }
                        if (src.indexOf("http") === 0) {
                            
                        } else {
                            src = "/api/files/" + src;
                        }
                        self.$body.find('.avatar').append('<img class="editAvatar" src="' + src + '" />');
                    } else if(isAdmin || account.isOwner(self.model.id)) {
                        self.$body.find('.avatar').append('<button class="editAvatar" title="Upload your avatar">'+self.ui.defaultAvatar+'</button>');
                    }
                });
            }
            
            this.setElement(this.$el);
            return this;
        },
        renderActions: function() {
            this.actions.render();
        },
        show: function() {
            this.$el.show();
        },
        events: {
            "keyup .editDisplayName": "submit",
            "click .showPassForm": "showPassForm",
            'blur input[name="pass"]': "showPassAgainBlur",
            'keyup input[name="pass"]': "showPassAgainKeyup",
            'keyup input[name="pass_again"]': "changePassword",
            'blur input[name="pass_again"]': "changePassword",
            "blur .editDisplayName": "editDisplayName",
            "keyup .editEmail": "editEmailKeyup",
            "blur .editEmail": "editEmail",
            "click .editAvatar": "editAvatar",
            "click .connectEmail": "connectEmail"
        },
        connectEmail: function() {
            this.$el.find('.connectEmail').hide();
            this.$el.find('input[name="email"]').show();
            this.$el.find('input[name="email"]').focus();
        },
        submit: function(e) {
            if(e.keyCode == 13) {
                this.editDisplayName(e);
            }
            return false;
        },
        showPassAgainBlur: function(e) {
            if(this.$el.find('input[name="pass"]').val() == '') {
                this.resetPassForm();
            } else {
                this.showPassAgain(e);
            }
        },
        showPassAgainKeyup: function(e) {
            if(e.keyCode == 13) {
                if(this.$el.find('input[name="pass"]').val() == '') {
                    this.resetPassForm();
                }
                this.showPassAgain(e);
            } else if(e.keyCode == 27) {
                this.resetPassForm();
            }
            return false;
        },
        resetPassForm: function() {
            this.$el.find('.inputPass input').val('');
            this.$el.find('.inputPass .showPassForm').show();
            this.$el.find('.inputPass form').hide();
        },
        showPassForm: function(e) {
            var $e = $(e.target);
            $e.siblings().show();
            $e.hide();
            this.$el.find('.passwordOnce').show();
            this.$el.find('.passwordAgain').hide();
            this.$el.find('input[name="pass"]').focus();
            return false;
        },
        showPassAgain: function() {
            this.$el.find('.passwordAgain').show();
            this.$el.find('.passwordOnce').hide();
            this.$el.find('.passwordAgain input').focus();
        },
        changePassword: function(e) {
            if((this.$el.find('input[name="pass_again"]').val() == '' && e.keyCode == 13) || e.keyCode == 27) {
                this.resetPassForm();
                return false;
            }
            if(!e.keyCode || e.keyCode == 13) {
                var self = this;
                var newPass = this.$el.find('input[name="pass"]').val();
                var newPassCheck = this.$el.find('input[name="pass_again"]').val();
                if(!newPassCheck) {
                    return false;
                }
                if(newPass && newPassCheck && newPass == newPassCheck) {
                    this.model.set({'oldPass': '', 'pass': newPass}, {silent: true});
                    var saveModel = this.model.save(null, {
                        silent: false,
                        wait: true
                    });
                    if(saveModel) {
                        saveModel.done(function() {
                            alert('Password changed.');
                            delete self.model.attributes.pass;
                            self.render();
                        });
                        saveModel.fail(function(s, typeStr, respStr) {
                            alert('Your password was incorrect');
                        });
                    }
                } else {
                    alert("Passwords mismatch!");
                    this.$el.find('.inputPass input').val('');
                    this.$el.find('.passwordOnce').show();
                    this.$el.find('.passwordAgain').hide();
                    this.$el.find('input[name="pass"]').focus();
                }
            }
        },
        resetEmailForm: function() {
            
        },
        editEmailKeyup: function(e) {
            if(e.keyCode == 27) {
                this.resetEmailForm();
                return false;
            } else if(e.keyCode == 13) {
                this.editEmail(e);
            }
        },
        editEmail: function(e) {
            var self = this;
            var txt = $(e.target).val();
            if(txt && txt !== this.model.get('email') && txt !== '' && txt.length > 4 && txt.indexOf('@') !== -1) {
                this.model.set({'email': txt}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false ,
                    wait: true
                });
                if(saveModel) {
                    saveModel.done(function() {
                        self.render();
                    });
                    saveModel.fail(function(s, typeStr, respStr) {
                        alert('That email address is already in use.');
                    });
                }
            } else if(txt !== '') {
                alert('Please use a valid email address.');
            }
            return false;
        },
        editDisplayName: function(e) {
            var self = this;
            var d = this.model.get('displayName') || this.model.get('name');
            //var txt = prompt("Enter your new display name", d);
            var txt = $(e.target).val();
            if(txt && txt !== d) {
                this.model.set({'displayName': txt}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false ,
                    wait: true
                });
                if(saveModel) {
                    saveModel.done(function() {
                        self.render();
                    });
                }
            }
            return false;
        },
        editAvatar: function() {
            var self = this;
            if(window.FilesBackbone) {
                self.uploadFrame = new window.FilesBackbone.UploadFrame({collection: window.filesCollection, type:'image', metadata:{groups: ['public']}});
                self.uploadFrame.on('uploaded', function(data){
                    if(_.isArray(data)) {
                        data = _.first(data);
                    }
                    if(data.image) {
                        var setDoc = {
                            image: data.image
                        }
                        var avatar = data.image.filename;
                        if(data.image.sizes) {
                            if(data.image.sizes.small) {
                                avatar = data.image.sizes.small.filename;
                            } else if(data.image.sizes.thumb) {
                                avatar = data.image.sizes.thumb.filename;
                            }
                        }
                        setDoc.avatar = avatar;
                        self.model.set(setDoc, {silent: true});
                        var saveModel = self.model.save(null, {
                            silent: false,
                            wait: true
                        });
                        if(saveModel) {
                            saveModel.done(function() {
                                self.render();
                                self.uploadFrame.remove();
                            });
                        }
                    }
                });
                this.$el.find('.avatar').append(this.uploadFrame.render().$el);
                self.uploadFrame.pickFiles();
            }
            return false;
        },
        remove: function() {
            this.$el.remove();
        }
    });
    
    window.nl2br = function(str) {
        return (str + "").replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, "$1" + "<br />");
    };
    
    var AvatarView = Backbone.View.extend({
        tagName: "span",
        className: "avatar",
        render: function() {
            this.$el.html('');
            var $byline = $('<span class="byline"></span>');
            if(this.model.has('title')) {
                this.$el.append('<strong class="title">'+this.model.get('title')+'</strong>');
            }
            if(this.model.has('owner')) {
                $byline.append(' by '+this.model.get('owner').name);
            }
            if(this.model.has('msg')) {
                var $msg = $('<span class="msg"></span>');
                $msg.html(this.model.get('msg'));
                this.$el.append($msg);
            }
            this.$el.append($byline);
            this.$el.attr('data-id', this.model.get("_id"));
            //this.$el.append(this.actions.render().$el);
            this.setElement(this.$el);
            return this;
        },
        initialize: function(options) {
            if(options && options.list) {
                this.list = options.list;
            }
            if(this.model) {
                this.model.bind('change', this.render, this);
                this.model.bind('destroy', this.remove, this);
            }
        },
        events: {
          "click": "select"
        },
        select: function(e) {
            var deselectSiblings = function(el) {
                el.siblings().removeClass('selected');
                el.siblings().removeAttr('selected');
            }
            
            deselectSiblings(this.$el);
            this.$el.addClass("selected");
            this.$el.attr("selected", true);
            
            if(this.hasOwnProperty('list')) {
                this.list.trigger('select', this);
            }
                
            this.trigger('select');
            this.trigger('resize');
        },
        remove: function() {
          $(this.el).remove();
        }
    });
    var SelectGroupsView = Backbone.View.extend({
        tagName: "select",
        className: "groups",
        initialize: function() {
            this.$options = $('<option value="public">public</option><option value="private">private</option>');
        },
        render: function() {
            var self = this;
            this.$el.attr('name', 'groups');
            this.$el.append(this.$options);
            if(this.model && this.model.has('groups') && this.model.get('groups').indexOf('public') !== -1) {
                this.$el.val('public');
            } else {
                this.$el.val('private');
                this.$options.find('option[value="private"]').attr('selected','selected');
            }
            this.setElement(this.$el);
            return this;
        },
        val: function() {
            var groups = [];
            if(this.$el.find('input').val() == 'public') {
                groups = ['public'];
            }
            return groups;
        },
        events: {
        }
    });
    var FormView = Backbone.View.extend({
        tagName: "div",
        className: "form",
        initialize: function() {
            var self = this;
            this.$owner = $('');
            if(this.model && this.model.id) {
                this.$el.attr('data-id', this.model.id);
                this.$owner = $(''+this.model.get('owner').name);
            } else {
                if(!this.model) {
                    this.model = new Model({}, {
                        collection: this.collection
                    });
                } else {
                }
            }
            this.wsyi_id = 'wysihtml5-'+this.cid;
            this.$inputName = $('<input type="text" name="name" placeholder="Name" autocomplete="off" />');
            this.$inputMsg = $('<textarea id="'+this.wsyi_id+'-textarea" name="msg" placeholder="Your message..."></textarea>');
            this.$inputSlug = $('<input type="text" name="slug" placeholder="post-title" />');
            this.$slugShare = $('<span class="slugShare"></span>');
            this.$slugShare.html('/posts/'); //window.location.origin+
            this.$slugShare.append(this.$inputSlug);
            
            this.$inputAtDate = $('<input name="at-date" type="date"/>');
            this.$inputAtTime = $('<input type="time"/>');
            
            this.atPublished = $('<span class="published"><span class="by">by <span class="owner"></span></span><br /><span class="at">at </span></span>');
            this.atPublished.find('.owner').append(this.$owner);
            this.atPublished.find('.at').append(this.$inputAtDate);
            this.atPublished.find('.at').append(this.$inputAtTime);
            
            this.inputGroupsView = new SelectGroupsView({model: this.model});
            this.feedView = new ActionFeedView({model: this.model});
            this.deleteView = new ActionDeleteView({model: this.model});
            
            this.$form = $('<form class="post"><fieldset></fieldset><controls></controls></form>');
            this.$form.find('fieldset').append(this.$inputTitle);
            this.$form.append(this.$msgToolbar);
            this.$form.find('fieldset').append(this.$inputMsg);
            this.$form.find('fieldset').append('<hr />');
            this.$form.find('fieldset').append(this.$slugShare);
            this.$form.find('fieldset').append(this.atPublished);
            this.$form.find('fieldset').append(this.feedView.render().$el);
            this.$form.find('fieldset').append(this.deleteView.render().$el);
            this.$form.find('controls').append(this.inputGroupsView.render().$el);
            this.$form.find('controls').append('<input type="submit" value="POST" />');
        },
        render: function() {
            var self = this;
            if(this.$el.find('form').length === 0) {
                this.$el.append(this.$form);
            }
            if(this.model) {
                if(this.model.has('title')) {
                    this.$inputTitle.val(this.model.get('title'));
                }
                if(this.model.has('msg')) {
                    this.$inputMsg.val(this.model.get('msg'));
                }
                if(this.model.has('slug')) {
                    this.$inputSlug.val(this.model.get('slug'));
                }
                if(this.model.has('groups')) {
                    this.inputGroupsView.val(this.model.get('groups'));
                }
                if(this.model.has('at')) {
                    this.$inputAtDate.val(this.model.get('at').substr(0,10));
                    this.$inputAtTime.val(this.model.get('at').substr(11,5));
                }
                if(this.model.has('owner')) {
                    
                    this.model.getOwner(function(owner){
                        if(owner) {
                            self.$owner.html(owner.getAvatarNameView().render().$el);
                        }
                    });
                }
            }
            this.setElement(this.$el);
            return this;
        },
        wysiEditor: function() {
            // set h/w of textarea
            $('#'+this.wsyi_id+'-textarea').css('height', $('#'+this.wsyi_id+'-textarea').outerHeight());
            $('#'+this.wsyi_id+'-textarea').css('width', $('#'+this.wsyi_id+'-textarea').outerWidth());
            this.editor = new wysihtml5.Editor(this.wsyi_id+"-textarea", { // id of textarea element
              toolbar:      this.wsyi_id+"-toolbar", // id of toolbar element
              parserRules:  wysihtml5ParserRules // defined in parser rules set 
            });
        },
        events: {
            "submit form": "submit",
            'keyup input[name="title"]': "throttleTitle",
            'blur input[name="title"]': "blurTitle"
        },
        blurTitle: function() {
            var titleStr = this.$inputTitle.val().trim();
            if(titleStr != '') {
                // autosave
            }
        },
        throttleTitle: _.debounce(function(){
            this.refreshTitle.call(this, arguments);
        }, 300),
        refreshTitle: function(e) {
            var titleStr = this.$inputTitle.val().trim();
            this.trigger('title', titleStr);
            //this.model.set('title', titleStr);
            if(!this.model.has('slug') || this.model.isNew()) {
                //this.model.setSlug(titleStr);
                 this.$inputSlug.val(this.model.slugStr(titleStr));
            }
            //this.render();
            //this.focus();
        },
        submit: function() {
            var self = this;
            var setDoc = {};
            var title = this.$inputTitle.val();
            var msg = this.$inputMsg.val();
            var slug = this.$inputSlug.val();
            var groups = this.inputGroupsView.val();
            if(title !== '' && title !== this.model.get('title')) {
                setDoc.title = title;
            }
            if(msg !== '' && msg !== this.model.get('msg')) {
                setDoc.msg = msg;
            }
            if(slug !== '' && slug !== this.model.get('slug')) {
                setDoc.slug = slug;
            }
            if(groups.length > 0 && groups !== this.model.get('groups')) {
                setDoc.groups = groups;
            }
            this.model.set(setDoc, {silent: true});
            var saveModel = this.model.save(null, {
                silent: false ,
                wait: true
            });
            if(saveModel) {
                saveModel.done(function() {
                    self.trigger("saved", self.model);
                    self.collection.add(self.model);
                });
            } else {
                self.trigger("saved", self.model);
            }
            return false;
        },
        focus: function() {
            this.$inputTitle.focus();
        },
        remove: function() {
            $(this.el).remove();
        }
    });
    
    if(define) {
        define(function () {
            return {
                Collection: Collection,
                Model: Model,
                List: ListView,
                Row: RowView,
                Avatar: AvatarView,
                Full: FullView,
                Form: FormView
            }
        });
    }
})();
