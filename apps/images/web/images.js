(function() {
    var pageSize = 8;

    var ImagesView = Backbone.View.extend({
        tag: 'span',
        className: 'menu',
        initialize: function() {
            var self = this;
            require(['../files/files.js'], function(FilesBackbone){
                self.FilesBackbone = FilesBackbone;
                require(['backbone-images.js'], function(ImagesBackbone){
                    self.ImagesBackbone = ImagesBackbone;
                    require(['backbone-checkins.js'], function(CheckinsBackbone){
                        self.CheckinsBackbone = CheckinsBackbone;
                        self.initFiles(function(){
                            self.initImages(function(){
                                self.imagesCollection.load(null, function(){
                                    self.filesCollection.load(null, function(){
                                        self.initialized = true;
                                        self.trigger('initialized');
                                    });
                                });
                            });
                        });
                    });
                });
            });
            
            require(['../desktop/jquery.idle-timer.js'], function() {
                var idleTimer = $(document).idleTimer(2400);
                $(document).bind("idle.idleTimer", function(e){
                    $('body').addClass('idle');
                });
                $(document).bind("active.idleTimer", function(){
                    $('body').removeClass('idle');
                });
            });
        },
        initImages: function(callback) {
            var self = this;
            self.imageViewerImages = {};
            this.$imageList = $('<div id="images-list" class="pImages"></div>');
            this.$imageViewer = $('<div id="image-viewer" class="pImageViewer"></div>');
            self.imagesCollection = new self.ImagesBackbone.Collection(); // collection
            self.imagesCollection.pageSize = pageSize;
            self.checkinsCollection = new self.CheckinsBackbone.Collection();
            this.imagesListView = new self.ImagesBackbone.List({collection: this.imagesCollection});
            this.imagesListView.on('select', function(imageRow) {
                self.router.navigate('image/'+imageRow.model.get('id'), true);
            });
            if(callback) callback();
        },
        initFiles: function(callback) {
            var self = this;
            this.$filesList = $('<div id="files-list" class="pImport"></div>');
            self.filesCollection = new self.FilesBackbone.Collection();
            self.filesCollection.pageSize = pageSize;
            self.filesCollection.filterContentType('image');
            self.filesCollection.filterProc(true);
            self.filesList = new self.FilesBackbone.List({collection: self.filesCollection});
            
            this.$upload = $('<span class="upload"></span>');
            self.newFileForm = new self.FilesBackbone.FileForm({collection: self.filesCollection, type: 'image'});
            self.newFileForm.on('upload', function(data){
                if(data.image) {
                    self.imagesCollection.add(data.image);
                    self.router.navigate('image/'+data.image.id, true);
                }
            });
            
            if(callback) callback();
        },
        render: function() {
            var self = this;
            this.$el.html('');
            this.setElement(this.$el);
            if(!this.initialized) {
                this.on('initialized', function(){
                    self.render();
                });
                return this;
            }
            this.$filesList.append(self.newFileForm.render().$el);
            this.$filesList.append(self.filesList.render().$el);
            this.$el.append(this.$filesList);
            this.$imageList.append(self.imagesListView.render().$el);
            this.$el.append(this.$imageList);
            this.$el.append(this.$imageViewer);
            return this;
        },
        findImageById: function(id) {
            return this.imagesCollection.get(id);
        },
        userIsAdmin: function() {
            return (this.user && this.user.has('groups') && this.user.get('groups').indexOf('admin') !== -1);
        },
        bindAuth: function(auth) {
            var self = this;
            self.auth = auth;
        },
        bindUser: function(user) {
            var self = this;
            self.user = user;
            self.trigger('refreshUser', user);
        },
        bindNav: function(nav) {
            this.nav = nav;
            this.bindRouter(nav.router);
            
            nav.col.add({title:"Images", navigate:""});
            nav.col.add({title:"Import files", navigate:"import"});
        },
        bindRouter: function(router) {
            var self = this;
            self.router = router;
            router.on('reset', function(){
                self.$imageViewer.html('');
                self.$imageList.hide();
                self.$filesList.hide();
                console.log(self.nav);
                self.nav.unselect();
            });
            router.on('root', function(){
                self.$imageList.show();
                router.setTitle('Images');
                self.nav.selectByNavigate('');
                router.trigger('loadingComplete');
            });
            router.route('image/:id', 'menu', function(id){
                router.reset();
                var image = self.findImageById(id);
                if(image) {
                    self.$imageViewer.append(image.getFullView().render().$el);
                }
                router.trigger('loadingComplete');
            });
            router.route('import', 'import', function(){
                router.reset();
                router.setTitle('Import');
                self.$filesList.show();
                router.trigger('loadingComplete');
                self.nav.selectByNavigate('import');
            });
        }
    });
    
    
    if(define) {
        define(function () {
            return ImagesView;
        });
    }
    
})();
