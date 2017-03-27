/**
 * A custom event mechanism implementation inspired by nodejs EventEmitter and
 * backbone.Events
 *
 * @module core/event/emitter
 * @author Allex Wang (allex.wxn@gmail.com)
 * MIT Licensed
 *
 * <code><pre>
 *  var EventEmitter = require('lib/core/1.0.0/event/emitter')
 *  var object = new EventEmitter();
 *  object.on('expand', function(){ alert('expanded'); });
 *  object.emit('expand');
 * </pre></code>
 */
(function(global, factory) {
  // Set up EventEmitter appropriately for the environment. Start with AMD.
  if (typeof define === 'function' && define.amd) {
    define(factory);

  // Next for Node.js or CommonJS.
  } else if (typeof module !== 'undefined') {
    factory(require, module.exports, module)

  // Finally, as a browser global.EventEmitter
  } else {
    var out = {exports: {}}
    factory(null, out.exports, out);
    global.EventEmitter = out.exports;
  }
}(this, function( require, exports, module ) {
'use strict';

// EventEmitter
//
// -----------------
// Thanks to:
//  - https://github.com/documentcloud/backbone/blob/master/backbone.js
//  - https://github.com/joyent/node/blob/master/lib/events.js

// Regular expression used to split event strings
var eventSplitter = /\s+/;

var now = Date.now || function() { return +new Date }

// guid for current runtime seed generator
var guid = function() { return now() * Math.random() & 0xFFFF }();

/*! Weakdata - https://gist.github.com/b84827b7af6da78acb67ca75839cf1c6 by @allex | MIT License */
var weakdata = function() {
  var data, seed, hid
  return typeof WeakMap === 'function' && (WeakMap.prototype || 0).set ?
    (data = new WeakMap(),
     function(o, initial) {
      var d = data.get(o);
      return initial === null
        ? d !== undefined && data['delete'](o)
        : ( !d && initial ? (data.set(o, d = {}), d) : d )
    }) :
    (
     seed = now(),
     hid = '__$wid\u03A6' + seed.toString(36), data = {},
     function(o, initial) {
      // polyfill method for WeakMap getter & setter
      if (!o || typeof o !== 'object')
        throw TypeError('Invalid value used as weak map key');
      var id;
      return initial === null
        ? o[hid] && ( delete data[o[hid]], delete o[hid] )
        : (
            id = ( o[hid] || initial && ( id = ++seed, data[id] = {}, o[hid] = id ) ),
            id && data[id]
          )
    })
}();

// Support two styles of arguments provided to the event subscribers.
//
// - The NORMAL type returns the original args passed to emit.
// - The FLAT type returns two parameters: the event source object and the the array
// of args passed to emit.
var MODE_NORAML = 0x01
  , MODE_FLAT   = 0x02

  // listener object meta data properties.
  , LISTENER_ATTR_FUNC = 0
  , LISTENER_ATTR_THIS = 1
  , LISTENER_ATTR_MODE = 2

// listener struct
// >> [ fn, context, mode ]
var createListener = function(fn, ctx, mode) {
  var opts = []
  opts[LISTENER_ATTR_FUNC] = fn
  opts[LISTENER_ATTR_THIS] = ctx
  opts[LISTENER_ATTR_MODE] = mode
  return opts
}

// A module that can be mixed in to *any object* in order to provide it
// with custom events. You may bind with `on` or remove with `un` callback
// functions to an event; `emit`-ing an event fires all callbacks in
// succession.
//
//     var object = new EventEmitter();
//     object.on('expand', function(){ alert('expanded'); });
//     object.emit('expand');
//
function EventEmitter() {

}

var __proto__ = EventEmitter.prototype

// Bind one or more space separated events, `events`, to a `callback`
// function. Passing `"all"` will bind the callback to all events fired.
// Provider single listener binding if the 4th argument [`single`] is true.
__proto__.addListener = function(events, callback, context, single) {
  var cache, event, list, mode = MODE_NORAML

  // Impl event listener interface in DOM Level 2
  if (callback && typeof callback === 'object') {
    context = callback
    callback = context.handleEvent
    mode = MODE_FLAT
  }

  if (!callback) return this

  cache = weakdata(this, 1) // init weak store if not exists
  events = events.split(eventSplitter)

  while (event = events.shift()) {
    list = !single && cache[event] || (cache[event] = [])
    list.push(createListener(callback, context, mode))
  }

  return this
}

__proto__.on = __proto__.addListener

__proto__.once = function(events, callback, context) {
  var fired = false

  var g = function() {
    this.removeListener(events, g)

    if (!fired) {
      fired = true
      callback.apply(context || this, arguments)
    }
  }

  // Use same guid so caller can remove using callback
  g.guid = callback.guid || ( callback.guid = guid++ )
  return this.on(events, g)
}

// Remove one or many callbacks. If `context` is null, removes all callbacks
// with that function. If `callback` is null, removes all callbacks for the
// event. If `events` is null, removes all bound callbacks for all events.
__proto__.removeListener = function(events, callback, context) {
  var cache, event, list, i, conf, handle

  if (callback && typeof callback === 'object') {
    context = callback
    callback = context.handleEvent
  }

  // No events, or removing *all* events.
  if (!(cache = weakdata(this))) return this
  if (!(events || callback || context)) {
    forIn(cache, function(v, k) { delete cache[k] })
    weakdata(this, null) // release weak store
    return this
  }

  events = events ? events.split(eventSplitter) : keys(cache)

  // Loop through the callback list, splicing where appropriate.
  while (event = events.shift()) {
    list = cache[event]
    if (!list) continue

    if (!(callback || context)) {
      delete cache[event]
      continue
    }

    for (i = list.length; --i >= 0; ) {
      conf = list[i]
      handle = conf[LISTENER_ATTR_FUNC]
      if ( ( !callback || handle === callback || (handle.guid !== undefined && handle.guid === callback.guid) )
          && (!context || conf[LISTENER_ATTR_THIS] === context) ) {
        list.splice(i, 1)
      }
    }
  }

  return this
}

__proto__.un = __proto__.removeListener

__proto__.removeAllListeners = function(type) {
  return this.removeListener(type)
}

// Trigger one or many events, firing all bound callbacks. Callbacks are
// passed the same arguments as `emit` is, apart from the event name
// (unless you're listening on `"all"`, which will cause your callback to
// receive the true name of the event as the first argument).
__proto__.emit = function(events) {
  var cache, event, all, list, i, len, rest = [], args, returned = true;
  if ( !(cache = weakdata(this)) ) return this

  events = events.split(eventSplitter)

  // Fill up `rest` with the callback arguments.  Since we're only copying
  // the tail of `arguments`, a loop is much faster than Array#slice.
  for (i = 1, len = arguments.length; i < len; i++) {
    rest[i - 1] = arguments[i]
  }

  // For each event, walk through the list of callbacks twice, first to
  // emit the event, then to emit any `"all"` callbacks.
  while (event = events.shift()) {
    // Copy callback lists to prevent modification.
    if (all = cache.all) all = all.slice()
    if (list = cache[event]) list = list.slice()

    // Execute event callbacks except one named "all"
    if (event !== 'all') {
      returned = triggerEventEmitter(event, list, rest, this) && returned
    }

    // Execute "all" callbacks.
    returned = triggerEventEmitter(event, all, [event].concat(rest), this) && returned
  }

  return returned
}

function triggerEventEmitter(type, list, args, context) {
  var pass = true
  if (list) {
    var i = -1, opt, fn, ctx, eventObj= {type: type, timeStamp: now()}
    while (opt = list[++i]) {
      fn = opt[LISTENER_ATTR_FUNC]
      ctx = opt[LISTENER_ATTR_THIS] || context
      // try..catch to avoid events crashed by listener runtime exception.
      try {
        if (opt[LISTENER_ATTR_MODE] === MODE_FLAT)
          pass = fn.call(ctx, eventObj, args) !== false && pass
        else
          pass = fn.apply(ctx, args) !== false && pass
      } catch (e) { setTimeout(function() { console.error(e) }, 1) }
    }
  }
  // trigger will return false if one of the callbacks return false
  return pass;
}

// Mix `EventEmitter` to object instance or Class function.
EventEmitter.applyTo = function(receiver) {
  var proto = __proto__, properties = keys(proto)

  if (isFunction(receiver)) {
    // constructor extends
    each(properties, function(k) {
      receiver.prototype[k] = proto[k]
    })
  }
  else {
    // static extends
    each(properties, function(k) {
      copyProto(k)
    })
  }

  function copyProto(key, scope) {
    receiver[key] = function() {
      var v = proto[key].apply(scope || receiver, Array.prototype.slice.call(arguments))
      return v === scope ? this : v
    }
  }
}

// Retrieve the specified event listener count
EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
}

__proto__.listenerCount = listenerCount

function listenerCount(type) {
  var events = weakdata(this), evlistener
  if (events) {
    evlistener = events[type]
    return evlistener.length
  }
  return 0
}


// Helpers
// -------

function isFunction(func) {
  return Object.prototype.toString.call(func) === '[object Function]'
}

function forIn(o, fn) {
  for (var k in o) if (o.hasOwnProperty(k)) fn(o[k], k)
}

var keys = Object.keys || function(o) {
  var result = []
  forIn(o, function(v, k) {
    result.push(k)
  })
  return result
}

function each(o, fn) {
  o.forEach ? o.forEach(fn) : (function(o) {
    for (var i = -1, l = o.length; ++i < l; ) fn(o[i], i)
  }(o))
}


module.exports = EventEmitter

}));
// vim: set fdm=marker ts=2 sw=2 sts=2 tw=85 et :
