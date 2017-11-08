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

    // backbone 事件对象
    var Events = Backbone.Events = {

        // 绑定事件
        on: function(name, callback, context){
            // 如果不是单事件绑定，解开成单事件，然后绑定，而此次操作直接返回即可
            if(!eventsApi(this, 'on', name, [callback, context]) || !callback) return this;
            // 如果是单事件，this._events初始化，这里 this也就是指绑定 Events的 object
            this._events || (this.events = {});
            // 注册事件
            var events = this._events[name] || (this.events[name] = []);
            // 事件入栈
            events.push({callback: callback, context: context, ctx: context || this});
            // 链式调用
            return this;
        },
        once: function(name, callback, context){
            // 单事件
            if(!eventsApi(this, 'once', name, [callback, context]) || !callback) return this;
            // 保留 this
            var self = this;
            // 用 _.once包装，只会执行一次
            var once = _.once(function(){
                self.off(name, once);
                callback.apply(this, arguments);
            });
            // 设置 once的成员 _callback 为回调函数
            once._callback = callback;
            // 执行绑定，由于 once 是包装过的，所以只会执行一次
            return this.on(name, once, context);
        },
        off: function(name, callback, context){
            // 单事件，这里需要判断 events 必须要存在，否则解绑无意义
            if(!this.events || !eventsApi(this, 'off', name, [callback, context])) return this;
            // 无任何参数时，表示解绑所有事件，直接将 events设置为 undefined就行。
            if(!name && !callback && !context){
                this.events = void 0;
                return this;
            }

            // names初始化，如果传递了 name就直接赋值给 names，如果没有就获取 _events的键值
            // 这里主要考虑到，用户会解除一个obj的所有callback，而不会去指定name。譬如
            // object['on1'] = ['on1-1', 'on1-2', 'on1-3', 'Off'];
            // object['on2'] = ['on2-1', 'on2-2', 'on2-3', 'Off'];
            // object.off(null, 'Off'), 则会移除 object['on1'] 和 object['on2'] 中的 ['Off'];
            var names = name ? [name] : _.keys(this._events);

            // 遍历 names
            for(var i = 0, length = names.length; i < length; i++){
                name = names[i];

                // 获取事件
                var events = this._events[name];
                // 事件为空，遍历下一个
                if(!events) continue;

                // 没有指定要删除的 callback,直接删除整个 name
                if(!callback && !context){
                    delete this._events[name];
                    continue;
                }

                // 以下为指定了 name 和 callback的情况
                var remaining = [];
                // 遍历指定 name的 所有events事件（已经绑定的事件）
                for(var j = 0, k = events.length; j < k; j++){
                    // 获取当前的事件 event
                    var event = events[j];
                    // 以下为筛选出不需要解绑的事件
                    if(
                        // 根据 callback 查找不需要解绑事件
                        callback && callback !== event.callback &&
                        callback !== event.callback._callback ||
                        // 根据 context 查找不需要解绑事件
                        context && context !== event.context
                    ){
                        // 满足条件，压入 remaining栈
                        remaining.push(event);
                    }
                }
                // 如果 remaining中有元素，则用 remaining代替 this._events[name]，由此清除其他event
                if(remaining.length){
                    this._events[name] = remaining;
                } else {
                    // 如果 remaining 没有元素，则直接删除即可
                    delete this._events[name];
                }
            }
        },
        // 事件触发，调用 event方法
        trigger: function(name){
            // 方法集合为空，返回;
            if(!this.events) return this;
            // 保存参数
            var args = slice.call(arguments, 1);
            // 单事件
            if(!eventsApi(this, 'trigger', name, args)) return this;

            var events = this._events[name];
            var allEvents = this._events.all;
            // 触发两类事件，一类是事件标志位 name的，另一类为all的
            if(events) triggerEvents(events, args);
            if(allEvents) triggerEvents(allEvents, arguments);
            return this;
        },
        // 与 obj.on(name, callback, this)的区别是，this可以跟踪这个事件
        listenTo: function(obj, name, callback){
            // 初始化 this的 listeningTo 对象
            var listeningTo = this._listeningTo || (this._listeningTo = {});
            // 每个 obj 会被分配一个独立的 id
            var id = obj._listenId || (obj._listenId = _.uniqueId('l'));
            // 跟踪事件
            listeningTo[id] = obj;
            if(!callback && typeof name === 'object') callback = this;
            obj.on(name, callback, this);
            return this;
        },
        // 一次性事件的 listenTo
        listenToOnce: function(obj, name, callback){
            // 以下为对 name 的单事件处理
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
            // 一次性事件包装
            var once = _.once(function(){
                this.stopListening(obj, name, once);
                callback.apply(this, arguments);
            });
            once._callback = callback;
            return this.listenTo(obj, name, once);
        },
        // 移除事件
        stopListening: function(obj, name, callback){
            var listeningTo = this._listeningTo;
            if(!listeningTo) return this;
            var remove = !name && !callback;
            if(!callback && typeof name === 'object') callback = this;
            // 如果指定了 obj 就直接对 this._listeningTo[obj.listenId]进行操作
            if(obj)(listeningTo = {}) [obj._listenId] = obj;
            // 到这里的时候，listeningTo 里面存有的是所有待取消的事件
            // 遍历 listeningTo
            for( var id in listeningTo ){
                // 获取 obj
                obj = listeningTo[id];
                // 取消 obj中的 name事件
                obj.off(name, callback, this);
//!!!                // 这里存疑，为什么要判断 obj._events是否为空
                if(remove || _.isEmpty(obj._events)) delete this._listeningTo[id];
            }
            return this;
        }
    };

    var eventSplitter = /\s+/;

    // backbone 为了支持 "change blur"(带空格的多事件绑定)和"{change: action}"(类jquery 事件绑定)。
    // 将这两种方式都展开为单事件绑定
    var eventsApi = function(obj, action, name, rest){
        if(!name) return true;
        if(typeof name === 'object'){
            for (var key in name){
                // 类{change: action} 的事件绑定，将键值取出来一个一个绑定
                obj[action].apply(obj, [key, name[key]], concat(rest));
            }
            return false;
        }

        if(eventSplitter.test(name)){
            var names = name.split(eventSplitter);
            for(var i = 0, length = names.length; i < length; i++){
                // "change blur" 的事件绑定，用正则分离，然后一个一个绑定
                obj[action].apply(obj, [names[i]].concat(rest));
            }
            return false;
        }
        return true;
    }

    // 事件触发的内部方法
    var triggerEvents = function(events, args){
        // 跟 underscore 中的 optimizeCb一个道理，尽量不使用 apply 而是 call
        var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
        switch(args.length){
            case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
            case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
            case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
            case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
            default: while(++i < l) (ev = events[i]).callback.apply(ev.ctx, args); return;
        }
    };

    // 多种方法名
    Events.bind   = Events.on;
    Events.unbind = Events.off;

    // 挂载Events对象到backbone上(之前定义的时候就已经扩展了，这里为什么又要扩展).
    _.extend(Backbone, Events);

    // backbone 模型对象
    var Model = Backbone.Model = function(attributes, options){
        var attrs = attributes || {};
        options || (options = {});
        this.cid = _.uniqueId('c');
        this.attributes = {};
        if(options.collection) this.collection = options.collection;
        if(options.parse) attrs = this.parse(attrs, options) || {};
        attrs = _.defaults({}, attrs, _.result(this, 'defaults'));
        this.set(attrs, options);
        this.changed = {};
        this.initialize.apply(this, arguments);
    };

    // 下列方法和属性是添加在 Model 原型上面的
    _.extend(Model.prototype, Events, {
        changed: null,
        validationError: null,
        idAttribute: 'id',
        initialize: function(){},
        toJSON: function(options){
            return _.clone(this.attributes);
        },
        sync: function(){
            return Backbone.sync.apply(this, arguments);
        },
        get: function(attr){
            return this.attributes[attr];
        },
        escape: function(attr){
            return _.escape(this.get(attr));
        },
        has: function(attr){
            return this.get(attr) != null;
        },
        matches: function(attrs){
            return _.matches(attrs)(this.attributes);
        },
        set: function(key, val, options){
            var attr, attrs, unset, changes, silent, changing, prev, current;
            if(key == null) return this;
            if(typeof key === 'object'){
                attrs = key;
                options = val;
            } else {
                (attrs = {})[key] = val;
            }
            // 运行到这里时 attrs 里面存的(key:val)的键值对，如果key是对象直接赋值给 attrs
            options || (options = {});

//<!>            // 如果没有通过验证，这里不太清楚，应该和后面有关系
            if(!this._validate(attrs, options)) return false;

            unset          = options.unset;
            silent         = options.silent;
            changes        = [];

            // 这个似乎防止 set过程被其他代码打扰（包括其他运行这个方法的代码）
            // changing 获取 执行之前的this._changing;
            changing       = this._changing;
            // 将 this._changing设置为true，表示正在由代码执行这个方法，让其他代码不要打扰
            this._changing = true;

            // 如果之前没有代码正在执行这个方法（changing为false）
            if(!changing){
                // 改变之前把之前的属性保存好，对象不仅会保存当前的属性，还会保存上一次更改的属性
                this._previousAttributes = _.clone(this.attributes);
                this.changed = {};
            }
            // 获取现在的属性和之前一个版本的属性
            current = this.attributes, prev = this._previousAttributes;

            if(this.idAttribute in attrs) this.id = attrs[this.idAttribute];

            // attrs 中存有需要更改的属性
            for(attr in attrs){
                val = attrs[attr];
                // 如果 val不等于 当前的属性，压入 changes
                if(!_.isEqual(current[attr], val)) changes.push(attr);
                // 如果 val不等于 上一次的属性，压入 changed
                if(!_.isEqual(prev[attr], val)){
                    this.changed[attr] = val;
                }
                // 如果 val等于 上一次的属性，删除 changed中的attr
                 else {
                    delete this.changed[attr];
                }
                // 如果options 中设置了 unset，则删除属性，否则更改属性的值
                unset ? delete current[attr] : current[attr] = val;
            }

            // 如果没有设定silent或设定为false，即如果确实改变了属性，会触发 change事件
            if(!silent){
                // 改变了事件，则 changes中存有被改变元素的值
                if(changes.length) this._pending = options;
                for( var i = 0, length = changes.length; i < length; i++){
                    this.trigger('change:' + changes[i], this, current[changes[i]], options);
                }
            }

            // 据文档所说，这里 changes可能会被递归嵌套 在 change事件中
            if(changing) return this;
            if(!silent){
                while(this._pending){
                    options = this._pending;
                    this._pending = false;
                    this.trigger('change', this, options);
                }
            }
            this._pending = false;
            this._changing = false;
            return this;
        },

        // unset 也就是吧 attr set为空
        unset: function(attr, options){
            return this.set(attr, void 0, _.extend({}, options, {unset: true}));
        },
        // 清除 this的所有 attrs
        clear: function(options){
            var attrs = {};
            for( var key in this.attributes ) attrs[key] = void 0;
            return this.set(attrs, _.extend({}, options, {unset: true}));
        },
        // 自上次 change 时间后，this 是否已经发生改变，
        hasChanged: function(attr){
            if(attr == null) return !_.isEmpty(this.changed);
            return _.has(this.changed, attr);
        },
        // 获取改变了的属性
        changedAttributes: function(diff){
            // 如果没有指定diff 则获取 this.changed
            if(!diff) return this.hasChanged() ? _.clone(this.changed) : false;
            var val, changed = false;
            // old 为之前一次的attrs
            var old = this._changing ? this._previousAttributes : this.attributes;
            // 指定了diff，则比较 old与 diff中的不同，压入 changed;
            for( var attr in diff ){
                if(_.isEqual(old[attr], (val = diff[attr]))) continue;
                (changed || (changed = {}))[attr] = val;
            }
            return changed;
        },
        // 获取之前一次change的指定 attr
        previous: function(attr){
            if(attr == null || !this._previousAttributes) return null;
            return this._previousAttributes[attr];
        },
        // 获取之前一次change的所有属性
        previousAttributes: function(){
            return _.clone(this._previousAttributes);
        },
        // 从服务器中同步当前属性
        fetch: function(options){
            options = options ? _.clone(options) : {};
            if(options.parse === void 0) options.parse = true;
            var model = this;
            var success = options.success;
            options.success = function(resp){
                if(!model.set(model.parse(resp, options), options)) return false;
                if(success) success(model, resp, options);
                model.trigger('sync', model, resp, options);
            };
            wrapError(this, options);
            return this.sync('read', this, options);
        },
        save: function(key, val, options){
            var attrs, method, xhr, attributes = this.attributes;
            if(key == null || typeof key === 'object'){
                attrs = key;
                options = val;
            } else{
                (attrs = {})[key] = val;
            }
            options = _.extend({validate: true}, options);
            if(attrs && !options.wait){
                if(!this.set(attrs, options)) return false;
            } else{
                if(!this._validate(attrs, options)) return false;
            }
            if(attrs && options.wait){
                this.attributes = _.extend({}, attributes, attrs);
            }
            if(options.parse === void 0) options.parse = true;
            var model = this;
            var success = options.success;
            options.success = function(resp){
                model.attributes = attributes;
                var serverAttrs = model.parse(resp, options);
                if(options.wait) serverAttrs = _.extend(attrs || {}, serverAttrs);
                if(_.isObject(serverAttrs) && !model.set(serverAttrs, options)){
                    return false;
                }
                if(success) success(model, resp, options);
                model.trigger('sync', model, resp, options);
            };
            wrapError(this, options);

            method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
            if(method === 'patch' && !options.attrs) options.attrs = attrs;
            xhr = this.sync(method, this, options);
            if(attrs && options.wait) this.attributes = attributes;

            return xhr;
        },
        destroy: function(options){
            options = options ? _.clone(options) : {};
            var model = this;
            var success = options.success;

            var destroy = function(){
                model.stopListening();
                model.trigger('destroy', model, model.collection, options);
            };
            options.success = function(resp){
                if(options.wait || model.isNew()) destroy();
                if(success) success(model, resp, options);
                if(!model.isNew()) model.trigger('sync', model, resp, options);
            };
            if(this.isNew()){
                options.success();
                return false;
            }
            wrapError(this, options);

            var xhr = this.sync('delete', this, options);
            if(!options.wait) destroy();
            return xhr;
        },
        url: function(){
            var base =
                _.result(this, 'urlRoot') ||
                _.result(this.collection, 'url') ||
                urlError();
            if(this.isNew()) return base;
            return base.replace(/([^\/])$/, '$1/') + encodeURIComponent(this.id);
        },
        parse: function(resp, options){
            return resp;
        },
        clone: function(){
            return new this.constructor(this.attributes);
        },
        isNew: function(){
            return !this.has(this.idAttribute);
        },
        isValid: function(options){
            return this._validate({}, _.extend(options || {}, {validate: true}));
        },
        _validate: function(attrs, options){
            if(!options.validate || !this.validate) return true;
            attrs = _.extend({}, this.attributes, attrs);
            var error = this.validationError = this.validate(attrs, options) || null;
            if(!error) return true;
            this.trigger('invalid', this, error, _.extend(options, {validationError: error}));
            return false;
        }
    });

    var modelMethods = ['keys', 'values', 'pairs', 'invert', 'pick', 'omit', 'chain','isEmpty'];
    _.each(modelMethods, function(method){
        if(!_[method]) return;
        Model.prototype[method] = function(){
            var args = slice.call(arguments);
            args.unshift(this.attributes);
            return _[method].apply(_, args);
        };
    });

    var Collection = Backbone.Collection = function(models, options){
        options || (options = {});
        if(options.model) this.model = options.mode;
        if(options.comparator !== void 0) this.comparator = options.comparator;
        this._reset();
        this.initialize.apply(this, arguments);
        if(models) this.reset(models, _.extend({silent: true}, options));
    };
    var setOptions = {add: true, remove: true, merge: true};
    var addOptions = {add: true, remove: false};
}))
