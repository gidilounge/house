// A Clock!
//
(function(){
    
    var ClockView = Backbone.View.extend({
        tag: 'span',
        className: 'app',
        initialize: function() {
            var self = this;
            self.init = false;
            require(['/clock/moment.js'], function() {
                self.init = true;
                self.trigger('init');
                self.startClocks();
                self.moment = moment;
            });
            this.$clock = $('<span class="clock"></span>');
        },
        render: function() {
            var self = this;
            this.$el.html(this.$clock);
            this.setElement(this.$el);
            if(!this.init) {
                this.on('init', function(){
                    self.render();
                });
                return this;
            }
            this.$clock.html(moment().format('MMMM Do YYYY, h:mm:ss a'));
            return this;
        },
        events: {
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
            nav.col.add({title:"Clock", navigate:""});
            //nav.col.add({title:"New post", navigate:"new"});
        },
        bindRouter: function(router) {
            var self = this;
            self.router = router;
            router.on('reset', function(){
            });
            router.on('root', function(){
                router.setTitle('Clock');
                self.nav.selectByNavigate('');
                router.trigger('loadingComplete');
            });
        },
        startClocks: function(el) {
            var self = this;
            setInterval(function(){
                self.render();
            },1000);
        }
    });

    if(define) {
        define(function () {
            return ClockView;
        });
    }
})();
