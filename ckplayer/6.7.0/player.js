define(function(require, exports, module) {
    'use strict';
    var $ = require('jquery');
    require('./ckplayer');
    var EventEmitter = require('lib/core/1.0.0/event/emitter');
    var Util = require('lib/core/1.0.0/utils/util');

    function Player(selector, options) {
        var _this = this;
        if (selector === undefined) {
            throw new Error('the param [selector] is required.');
        }
        _this.el = $(selector);
        _this._id = _this.el.attr('id');
        _this._guid = Util.guid();
        _this._playId = '_player' + _this._guid;
        _this._playing = false;
        _this._initGlobalEvent();
        var defaults = {
            interval: 1000, //是否需要启动监听，如果大于0就监听，最好大于1000ms
            swfPlayer: $PAGE_DATA['ckplayer'] || '', //必填
            embed: {
                width: '100%',
                height: '500'
            },
            params: {
                bgcolor: '#FFF',
                allowFullScreen: true,
                allowScriptAccess: 'always',
                wmode: 'transparent'
            },
            flash: {
                f: $PAGE_DATA['m3u8'] || '', //必填 要播放文件的路径
                a: $PAGE_DATA['play'] || '', //必填 如果要调用m3u8格式的文件，必须要用到的播放插件【调用时的参数，只有当s>0的时候有效】
                s: '4', //调用方式，0=普通方法（f=视频地址），1=网址形式,2=xml形式，3=swf形式(s>0时f=网址，配合a来完成对地址的组装)
                c: '0', //是否读取文本配置,0不是，1是
                x: '', //调用xml风格路径，为空的话将使用ckplayer.js的配置
                i: '', //初始图片地址
                u: '', //暂停时如果是图片的话，加个链接地址
                r: '', //前置广告的链接地址，多个用竖线隔开，没有的留空
                t: '', //视频开始前播放swf/图片时的时间，多个用竖线隔开
                y: '', //这里是使用网址形式调用广告地址时使用，前提是要设置l的值为空
                z: '', //缓冲广告，只能放一个，swf格式
                e: '0', //视频结束后的动作，0是调用js函数，1是循环播放，2是暂停播放并且不调用广告，3是调用视频推荐列表的插件，4是清除视频流并调用js功能和1差不多，5是暂停播放并且调用暂停广告
                v: '100', //默认音量，0-100之间
                p: '0', //视频默认0是暂停，1是播放
                h: '0', //播放http视频流时采用何种拖动方法，=0不使用任意拖动，=1是使用按关键帧，=2是按时间点，=3是自动判断按什么(如果视频格式是.mp4就按关键帧，.flv就按关键时间)，=4也是自动判断(只要包含字符mp4就按mp4来，只要包含字符flv就按flv来)
                q: '', //视频流拖动时参考函数，默认是start
                m: '0', //默认是否采用点击播放按钮后再加载视频，0不是，1是,设置成1时不要有前置广告
                o: '', //当m=1时，可以设置视频的时间，单位，秒
                w: '', //当m=1时，可以设置视频的总字节数
                g: '0', //视频直接g秒开始播放
                j: '', //视频提前j秒结束
                wh: '', //这是6.2新增加的宽高比，可以自己定义视频的宽高或宽高比如：wh:'4:3',或wh:'1080:720'
                ct: '2', //6.2新增加的参数，主要针对有些视频拖动时时间出错的修正参数，默认是2，自动修正，1是强制修正，0是强制不修正
                drift: '',
                loaded: _this._handlerList.loaded,
                my_url: encodeURIComponent(window.location.href) //本页面地址
            }
        };
        _this.options = $.extend(true, {}, defaults, options);
        CKobject.embedSWF(_this.options.swfPlayer, _this._id, _this._playId, _this.options.embed.width, _this.options.embed.height, _this.options.flash, _this.options.params);
        _this._init();
        _this._initEvent();
    };

    //继承自定义事件
    Util.inherits(Player, EventEmitter);

    Player.prototype._init = function() {
        var _this = this;
        _this.player = _this.get();
        _this._embed = _this.el.find('embed');
    }

    Player.prototype._initHandlerList = function() {
        var _this = this;
        _this._handlerList = {};
        //http://www.ckplayer.com/manual/9/50.htm
        var HANDLER_LIST = [
            'loaded',
            'play',
            'pause',
            'time',
            'ended',
            'error'
        ];
        for (var i = 0, len = HANDLER_LIST.length; i < len; i++) {
            _this._handlerList[HANDLER_LIST[i]] = HANDLER_LIST[i] + _this._guid
        }
    }

    Player.prototype._initGlobalEvent = function() {
        var _this = this;
        _this._initHandlerList();
        var handlerList = _this._handlerList;
        //初始化播放
        window[handlerList.loaded] = function() {
            var player = _this.get();
            if (player) {
                player.addListener('play', handlerList.play);
                player.addListener('pause', handlerList.pause);
                player.addListener('time', handlerList.time);
                player.addListener('ended', handlerList.ended);
                player.addListener('error', handlerList.error);
            }
        };
        //播放事件
        window[handlerList.play] = function() {
            _this._playing = true;
            _this.emit('play');
        };
        //暂停事件
        window[handlerList.pause] = function() {
            _this._playing = false;
            _this.emit('pause');
        };
        //播放进度
        window[handlerList.time] = function(seconds) {
            if (_this.options.interval > 0 && !_this._interval) {
                _this._interval = setInterval(function(seconds) {
                    if (_this._playing) {
                        _this.emit('time', _this.getCurrentTime());
                    }
                }, _this.options.interval);
            }
        };
        //播放结束
        window[handlerList.ended] = function() {
            _this._playing = false;
            _this.emit('ended');
        };
        //初始化错误
        window[handlerList.error] = function() {
            _this._playing = false;
            _this.emit('initError');
        };
    }

    Player.prototype._initEvent = function() {
        var _this = this;
        //事件监听
    }

    //播放
    Player.prototype.play = function() {
        var _this = this;
        _this.player && _this.player.videoPlay();
    }

    //播放|暂停
    Player.prototype.playOrPause = function() {
        var _this = this;
        _this.player && _this.player.playOrPause();
    }

    //暂停
    Player.prototype.pause = function() {
        var _this = this;
        _this.player && _this.player.videoPause();
    }

    //指定时间播放
    Player.prototype.jump = function(seconds) {
        var _this = this;
        if (seconds >= 0) {
            _this.player && _this.player.videoSeek(seconds);
        }
    }

    //播放指定视频，目前还有问题
    Player.prototype.go = function(url) {
        if (url === undefined) {
            throw new Error('this params [url] is require.');
        }
        var _this = this;
        _this.options.flash.f = url;
        _this.player && _this.player.newAddress(_this.options.flash);
    }

    //设置指定音量 
    Player.prototype.volume = function(volume) {
        var _this = this;
        if (0 <= volume && volume <= 100) {
            _this.player && _this.player.changeVolume(volume);
        }
    }

    //设置播放器width
    Player.prototype.width = function(width) {
        var _this = this;
        _this._embed && _this._embed.width(width || _this.options.embed.width);
    }

    //设置播放器height
    Player.prototype.height = function(height) {
        var _this = this;
        _this._embed && _this._embed.width(height || _this.options.embed.height);
    }

    //获取当前视频总时间
    Player.prototype.getTotalTime = function() {
        var _this = this;
        if (_this.player) {
            return _this.player.getStatus().totalTime;
        }
        return 0;
    }

    //获取当前播放时间
    Player.prototype.getCurrentTime = function() {
        var _this = this;
        if (_this.player) {
            return _this.player.getStatus().time;
        }
        return 0;
    }

    //获取当前播放器状态 详情见：http://www.ckplayer.com/manual/13/54.htm
    Player.prototype.getStatus = function() {
        var _this = this;
        if (_this.player) {
            return _this.player.getStatus();
        }
        return {};
    }

    //得到当前播放器
    Player.prototype.get = function() {
        var _this = this;
        return CKobject.getObjectById(_this._playId);
    }

    module.exports = Player;
});
