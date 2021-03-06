(function() {
    var PagesView = Backbone.View.extend({
        tag: 'body',
        initialize: function() {
            var self = this;
            require(['/msgs/msgs.js'], function(MsgsBackbone){
                window.MsgsBackbone = MsgsBackbone;
                window.msgsCollection = new MsgsBackbone.Collection(); // collection
                require(['/js/backbone-pages.js'], function(ModelBackbone){
                    window.PagesBackbone = ModelBackbone;
                    window.pagesCollection = new window.PagesBackbone.Collection(); // collection
                    require(['/files/backbone-files.js'], function(FilesBackbone){
                        window.FilesBackbone = FilesBackbone;
                        window.filesCollection = new FilesBackbone.Collection(); // collection
                        var loadCollections = function() {
                            window.pagesCollection.load(null, function(){
                                self.initialized = true;
                                self.trigger('initialized');
                            });
                        }
                        if(window.account) {
                            window.account.on('loggedIn', function(loginView){
                                loadCollections();
                            });
                        }
                        loadCollections();
                    });
                });
            });
        },
        render: function() {
            var self = this;
            //this.$el.html('');
            this.$el.find('footer .toTop').html($('<a href="#">Back to top</a>'));
            this.setElement(this.$el);
            return this;
        },
        events: {
            "click .toTop a": "gotoTop"
        },
        gotoTop: function() {
            $.scrollTo($('#home'),900);
            return false;
        },
        start: function(pagePath, callback) {
            var self = this;
            pagePath = pagePath || '/';
            window.pagesCollection.getOrFetchPath(pagePath, function(page){
                if(page) {
                    self.pageSelected = page;
                    // Set title
                    if(page.get('title')) {
                        $('.navbar-brand').html(page.get('title')); // TODO relative selector
                    }
                    
                    var $brand = $('.navbar-brand');
                    if($brand.length == 0) {
                        $brand = $('<a class="brand" href="#">'+page.get('title')+'</a>');
                        self.$el.find('.navbar .navbar-header').append($brand);
                    }
                    var brandView = page.getBrandView({el: $brand[0]});
                    brandView.on('gohome', function(){
                        self.router.navigate('/', true);
                    });
                    brandView.render();
                    
                    var sections = page.get('sections');
                    sections = _.sortBy(sections, 'rank');
                    for(var i in sections) {
                        var section = sections[i];
                        self.nav.col.add({title:section.name, navigate:section.id, id:section.id});
                    }
                    var $fEl = self.$el.find('#home');
                    var featureListView;
                    if($fEl.length > 0) {
                        var featureOpts = {el: $fEl};
                        featureOpts.onePageSlide = true;
                        featureListView = page.getFeaturesView(featureOpts).render();
                    } else {
                        featureListView = page.getFeaturesView();
                        featureListView.setElement($fEl);
                        featureListView.render();
                    }
                    featureListView.on('selected', function(view){
                        self.router.navigate(view.model.get('href'), true);
                    });
                    self.featureList = featureListView;
                    var $sEl = self.$el.find('.sections');
                    var sectionListView;
                    var listenToSection = function(){
                        sectionListView.on('addToNavSubs', function(section, subItems){
                            var n = self.nav.col.get(section.id);
                            if(n) {
                                n.set({sub: subItems});
                                n.trigger('change');
                            }
                        });
                        sectionListView.on('addToNavSub', function(section, subItem){
                            var n = self.nav.col.get(section.id);
                            if(n) {
                                var sub = n.get('sub');
                                if(sub) {
                                    sub.push(subItem);
                                    n.set({sub: sub});
                                } else {
                                    n.set({sub: [subItem]});
                                }
                            }
                        });
                    }
                    if($sEl.length > 0) {
                        sectionListView = page.getSectionsView({el: $sEl[0]});
                        listenToSection();
                        sectionListView.render();
                    } else {
                        sectionListView = page.getSectionsView();
                        listenToSection();
                        $('body').append(sectionListView.render().$el);
                    }
                    
                    var routerStartPath = $('base[href]').attr('href') || "/pages/";
                    self.nav.startRouter(routerStartPath);
                    
                    /*
                    $('.navbar').scrollspy();
                    $('[data-spy="scroll"]').each(function () {
                        var $spy = $(this).scrollspy('refresh');
                    });
                    $('.navbar').on('activate.bs.scrollspy', function (e) {
                        console.log(e.target.dataset.id)
                        if(e.target) {
                            var etid = e.target.dataset.id;
                            self.router.navigate(etid, {replace: false, trigger: false});
                        }
                    });
                    */
                    if(callback) {
                        callback();
                    }
                }
            });
        },
        findPageById: function(id, callback) {
            window.pagesCollection.getOrFetch(id, callback);
        },
        findPageByPath: function(path, callback) {
            window.pagesCollection.getOrFetchPath(path, callback);
        },
        userIs: function(userId) {
            return (this.user && this.user.id == userId);
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
            var self = this;
            this.nav = nav;
            this.bindRouter(nav.router);
            nav.col.add({title:"Home", navigate:""});
            
            if(window.account && (account.isUser() || account.isAdmin())) {
                //nav.col.add({title:"New", navigate:"new"});
            }
            this.nav.list.on('selectedSub', function(nav, sub){
                var options = {};
                options.offset = -100; //if($(window).width()>700) 
                var elStr = 'h3#'+sub.replace(/[^a-zA-Z0-9\s]/g,"").toLowerCase().replace(/ /gi, '-');
                $.scrollTo($(elStr),1300,options);
                if(nav.model.has("navigate")) {
                    self.nav.router.navigate(nav.model.get("navigate"), {replace: true, trigger: false});
                }
            });
        },
        bindRouter: function(router) {
            var self = this;
            var routerReset = function() {
                router.reset();
            }
            var hideFeatures = function() {
                $('html').removeClass('onePageSlider');
                $('#home').removeAttr('style').hide();
                $('#home').removeClass('onepage-wrapper');
                $('#home .item.active').removeClass('active');
                $('#home .item').removeAttr('style');
                //$('#home .item').first().addClass('active');
                $('.onepage-pagination').remove();
                $(document).unbind('mousewheel DOMMouseScroll');
            }
            self.router = router;
            router.on('title', function(title){
                var $e = $('#header h1');
                $e.html(title);
                $e.attr('class', '');
                var eh = $e.height();
                var eph = $e.offsetParent().height();
                if(eh > eph) {
                    var lines = Math.floor(eh/eph);
                    if(lines > 3) {
                        $e.addClass('f'+lines);
                        eh = $e.height();
                        eph = $e.offsetParent().height();
                        if(eh > eph) {
                            lines = Math.floor(eh/eph);
                            $e.addClass('l'+lines);
                        }
                    } else {
                        $e.addClass('l'+lines);
                    }
                }
            });
            router.on('reset', function(){
                //$('header').removeAttr('class');
                //self.nav.unselect();
                hideFeatures();
            });
            router.on('root', function(){
                if(self.pageSelected) {
                    router.setTitle(self.pageSelected.getTitleTxt());
                }
                self.nav.selectByNavigate('');
                router.trigger('loadingComplete');
                //if($(document).scrollTop()>200) {
                    //$.scrollTo($('#home'),1000);
                //}
                $('html').addClass('onePageSlider');
                $('#home').show();
                self.featureList.render();
            });
            router.route(':section/edit', 'editSection', function(sectionId){
                routerReset();
                self.pageSelected.findSectionById(sectionId, function(doc){
                    if(doc) {
                        self.editDoc(doc);
                    } else {
                        router.navigate('new', {replace: true, trigger: true});
                    }
                    router.trigger('loadingComplete');
                });
            });
            router.route(':section', 'pageSection', function(sectionId){
                routerReset();
                self.pageSelected.findSectionById(sectionId, function(doc){
                    if(doc) {
                        router.setTitle(doc.get('name'));
                        var docEl = doc.getView({list: self.listView}).render().$el.show().siblings().hide();
                    } else {
                        //router.navigate('new', {replace: true, trigger: true});
                    }
                    router.trigger('loadingComplete');
                });
                self.nav.selectByNavigate(sectionId);
                var options = {};
                options.offset = -100;
                //$.scrollTo($('#'+sectionId),1300, options);
            });
            router.route('new', 'new', function(){
                routerReset();
                router.trigger('loadingComplete');
                self.nav.selectByNavigate('new');
            });
        }
    });
    
    
    if(define) {
        define(function () {
            return PagesView;
        });
    }
    
})();
