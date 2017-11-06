(function(root, factory){
    if(typeof define === 'function' && define.amd){
        define(['underscore', 'jquery', 'exports'], function(_, $, exports){
            root.Backbone = factory(root, exports, _, $);
        })
    } else if(typeof exports !== 'undefined'){
        var _ = require('underscore');
        factory(root, exports, _);
    } else {
        root.Backbone = factory(root, {}, root._, (root.jQuery || root.Zepto || root.ender || root.$));
    }
}(this, function(root, Backbone, _, $){
    var previousBackbone = root.Backbone;

    var array = [];
    var slice = array.slice;

    Backbone.VERSION = '1.1.2';

    Backbone.$ = $;

    Backbone.noConflict = function(){
        root.Backbone = previousBackbone;
        return this;
    };

    Backbone.emulateHTTP = false;

    Backbone.emulateJSON = false;

    // on, once, off, trigger, listenTo, listenToOnce, stopListening
    var Events = Backbone.Events = {
        on: function(name, callback, context){
            if(!eventsApi(this, 'on', name, [callback, context]) || !callback) return this;

            this._events || (this.events = {});
            var events = this._events[name] || (this.events[name] = []);
            events.push({callback: callback, context: context, ctx: context || this});
            return this;
        },
        once: function(name, callback, context){
            if(!eventsApi(this, 'once', name, [callback, context]) || !callback) return this;

            var self = this;
            var once = _.once(function(){
                self.off(name, once);
                callback.apply(this, arguments);
            });
            once._callback = callback;
            return this.on(name, once, context);
        },
        off: function(name, callback, context){
            if(!this.events || !eventsApi(this, 'off', name, [callback, context])) return this;

            if(!name && !callback && !context){
                this.events = void 0;
                return this;
            }
            var names = name ? [name] : _.keys(this._events);
            for(var i = 0, length = names.length; i < length; i++){
                name = names[i];

                var events = this._events[name];
                if(!events) continue;

                if(!callback && !context){
                    delete this._events[name];
                    continue;
                }

                var remaining = [];
                for(var j = 0, k = events.length; j < k; j++){
                    var event = events[j];
                    if(
                        callback && callback !== event.callback &&
                        callback !== event.callback._callback ||
                        context && context !== event.context
                    ){
                        remaining.push(event);
                    }
                }

                if(remaining.length){
                    this._events[name] = remaining;
                } else {
                    delete this._events[name];
                }
            }
        },
        trigger: function(name){
            if(!this.events) return this;
            var args = slice.call(arguments, 1);
            if(!eventsApi(this, 'trigger', name, args)) return this;

            var events = this._events[name];
            var allEvents = this._events.all;
            if(events) triggerEvents(events, args);
            if(allEvents) triggerEvents(allEvents, arguments);
            return this;
        },
        listenTo: function(obj, name, callback){
            var listeningTo = this._listeningTo || (this._listeningTo = {});
            var id = obj._listenId || (obj._listenId = _.uniqueId('l'));
            listeningTo[id] = obj;
            if(!callback && typeof name === 'object') callback = this;
            obj.on(name, callback, this);
            return this;
        },
        listenToOnce: function(obj, name, callback){
            if(typeof name === 'object'){
                for( var event in name) this.listenToOnce(obj, event, name[event]);
                return this;
            }
            if(eventSplitter.test(name)){
                var names = name.split(eventSplitter);
                for(var i = 0, length = names.length; i < length; i++){
                    this.listenToOnce(obj, names[i], callback);
                }
                return this;
            }
            if(!callback) return this;
            var once = _.once(function(){
                this.stopListening(obj, name, once);
                callback.apply(this, arguments);
            });
            once._callback = callback;
            return this.listenTo(obj, name, once);
        },
        stopListening: function(obj, name, callback){
            var listeningTo = this._listeningTo;
            if(!listeningTo) return this;
            var remove = !name && !callback;
            if(!callback && typeof name === 'object') callback = this;
            if(obj)(listeningTo = {}) [obj._listenId] = obj;
            for( var id in listeningTo ){
                obj = listeningTo[id];
                obj.off(name, callback, this);
                if(remove || _.isEmpty(obj._events)) delete this._listeningTo[id];
            }
            return this;
        }
    };

    var eventSplitter = /\s+/;

    var eventsApi = function(obj, action, name, rest){
        if(!name) return true;
        if(typeof name === 'object'){
            for (var key in name){
                obj[action].apply(obj, [key, name[key]], concat(rest));
            }
            return false;
        }

        if(eventSplitter.test(name)){
            var names = name.split(eventSplitter);
            for(var i = 0, length = names.length; i < length; i++){
                obj[action].apply(obj, [names[i]].concat(rest));
            }
            return false;
        }
        return true;
    }

    var triggerEvents = function(events, args){
        var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
        switch(args.length){
            case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
            case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
            case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
            case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
            default: while(++i < l) (ev = events[i]).callback.apply(ev.ctx, args); return;
        }
    };

    Events.bind   = Events.on;
    Events.unbind = Events.off;

    _.extend(Backbone, Events);
}))
