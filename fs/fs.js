var JSMIPS = (function(JSMIPS) {
    function cDefine(x) {
        if (x in JSMIPS)
            return JSMIPS[x];
        throw new Error(x + " undefined");
    }

    function charCode(s) {
        return s.charCodeAt(0);
    }

    var FORCE_FILESYSTEM = false;
// Copyright 2010 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

function mergeInto(obj, other) {
  for (var i in other) {
    obj[i] = other[i];
  }
  return obj;
}
var LibraryManager = {library: {}};
// Copyright 2013 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

mergeInto(LibraryManager.library, {
  $PATH: {
    // split a filename into [root, dir, basename, ext], unix version
    // 'root' is just a slash, or nothing.
    splitPath: function(filename) {
      var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
      return splitPathRe.exec(filename).slice(1);
    },
    normalizeArray: function(parts, allowAboveRoot) {
      // if the path tries to go above the root, `up` ends up > 0
      var up = 0;
      for (var i = parts.length - 1; i >= 0; i--) {
        var last = parts[i];
        if (last === '.') {
          parts.splice(i, 1);
        } else if (last === '..') {
          parts.splice(i, 1);
          up++;
        } else if (up) {
          parts.splice(i, 1);
          up--;
        }
      }
      // if the path is allowed to go above the root, restore leading ..s
      if (allowAboveRoot) {
        for (; up; up--) {
          parts.unshift('..');
        }
      }
      return parts;
    },
    normalize: function(path) {
      var isAbsolute = path.charAt(0) === '/',
          trailingSlash = path.substr(-1) === '/';
      // Normalize the path
      path = PATH.normalizeArray(path.split('/').filter(function(p) {
        return !!p;
      }), !isAbsolute).join('/');
      if (!path && !isAbsolute) {
        path = '.';
      }
      if (path && trailingSlash) {
        path += '/';
      }
      return (isAbsolute ? '/' : '') + path;
    },
    dirname: function(path) {
      var result = PATH.splitPath(path),
          root = result[0],
          dir = result[1];
      if (!root && !dir) {
        // No dirname whatsoever
        return '.';
      }
      if (dir) {
        // It has a dirname, strip trailing slash
        dir = dir.substr(0, dir.length - 1);
      }
      return root + dir;
    },
    basename: function(path) {
      // EMSCRIPTEN return '/'' for '/', not an empty string
      if (path === '/') return '/';
      var lastSlash = path.lastIndexOf('/');
      if (lastSlash === -1) return path;
      return path.substr(lastSlash+1);
    },
    extname: function(path) {
      return PATH.splitPath(path)[3];
    },
    join: function() {
      var paths = Array.prototype.slice.call(arguments, 0);
      return PATH.normalize(paths.join('/'));
    },
    join2: function(l, r) {
      return PATH.normalize(l + '/' + r);
    },
  },
  // The FS-using parts are split out into a separate object, so simple path
  // usage does not require the FS.
  $PATH_FS__deps: ['$PATH', '$FS'],
  $PATH_FS: {
    resolve: function() {
      var resolvedPath = '',
        resolvedAbsolute = false;
      for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
        var path = (i >= 0) ? arguments[i] : FS.cwd();
        // Skip empty and invalid entries
        if (typeof path !== 'string') {
          throw new TypeError('Arguments to path.resolve must be strings');
        } else if (!path) {
          return ''; // an invalid portion invalidates the whole thing
        }
        resolvedPath = path + '/' + resolvedPath;
        resolvedAbsolute = path.charAt(0) === '/';
      }
      // At this point the path should be resolved to a full absolute path, but
      // handle relative paths to be safe (might happen when process.cwd() fails)
      resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter(function(p) {
        return !!p;
      }), !resolvedAbsolute).join('/');
      return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
    },
    relative: function(from, to) {
      from = PATH_FS.resolve(from).substr(1);
      to = PATH_FS.resolve(to).substr(1);
      function trim(arr) {
        var start = 0;
        for (; start < arr.length; start++) {
          if (arr[start] !== '') break;
        }
        var end = arr.length - 1;
        for (; end >= 0; end--) {
          if (arr[end] !== '') break;
        }
        if (start > end) return [];
        return arr.slice(start, end - start + 1);
      }
      var fromParts = trim(from.split('/'));
      var toParts = trim(to.split('/'));
      var length = Math.min(fromParts.length, toParts.length);
      var samePartsLength = length;
      for (var i = 0; i < length; i++) {
        if (fromParts[i] !== toParts[i]) {
          samePartsLength = i;
          break;
        }
      }
      var outputParts = [];
      for (var i = samePartsLength; i < fromParts.length; i++) {
        outputParts.push('..');
      }
      outputParts = outputParts.concat(toParts.slice(samePartsLength));
      return outputParts.join('/');
    }
  }
});
// Copyright 2013 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

mergeInto(LibraryManager.library, {
  $TTY__deps: ['$FS'],
  $TTY: {
    ttys: [],
    init: function () {
      // https://github.com/emscripten-core/emscripten/pull/1555
      // if (ENVIRONMENT_IS_NODE) {
      //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
      //   // device, it always assumes it's a TTY device. because of this, we're forcing
      //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
      //   // with text files until FS.init can be refactored.
      //   process['stdin']['setEncoding']('utf8');
      // }
    },
    shutdown: function() {
      // https://github.com/emscripten-core/emscripten/pull/1555
      // if (ENVIRONMENT_IS_NODE) {
      //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
      //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
      //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
      //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
      //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
      //   process['stdin']['pause']();
      // }
    },
    register: function(dev, ops) {
      TTY.ttys[dev] = { input: [], output: [], ops: ops };
      FS.registerDevice(dev, TTY.stream_ops);
    },
    stream_ops: {
      open: function(stream) {
        var tty = TTY.ttys[stream.node.rdev];
        if (!tty) {
          throw new FS.ErrnoError(( cDefine('ENODEV') ));
        }
        stream.tty = tty;
        stream.seekable = false;
      },
      close: function(stream) {
        // flush any pending line data
        stream.tty.ops.flush(stream.tty);
      },
      flush: function(stream) {
        stream.tty.ops.flush(stream.tty);
      },
      read: function(stream, buffer, offset, length, pos /* ignored */) {
        if (!stream.tty || !stream.tty.ops.get_char) {
          throw new FS.ErrnoError(( cDefine('ENXIO') ));
        }
        var bytesRead = 0;
        for (var i = 0; i < length; i++) {
          var result;
          try {
            result = stream.tty.ops.get_char(stream.tty);
          } catch (e) {
            throw new FS.ErrnoError(( cDefine('EIO') ));
          }
          if (result === undefined && bytesRead === 0) {
            throw new FS.ErrnoError(( cDefine('EAGAIN') ));
          }
          if (result === null || result === undefined) break;
          bytesRead++;
          buffer[offset+i] = result;
        }
        if (bytesRead) {
          stream.node.timestamp = Date.now();
        }
        return bytesRead;
      },
      write: function(stream, buffer, offset, length, pos) {
        if (!stream.tty || !stream.tty.ops.put_char) {
          throw new FS.ErrnoError(( cDefine('ENXIO') ));
        }
        try {
          for (var i = 0; i < length; i++) {
            stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
          }
        } catch (e) {
          throw new FS.ErrnoError(( cDefine('EIO') ));
        }
        if (length) {
          stream.node.timestamp = Date.now();
        }
        return i;
      }
    },
    default_tty_ops: {
      // get_char has 3 particular return values:
      // a.) the next character represented as an integer
      // b.) undefined to signal that no data is currently available
      // c.) null to signal an EOF
      get_char: function(tty) {
        if (!tty.input.length) {
          var result = null;
          if (typeof window != 'undefined' &&
            typeof window.prompt == 'function') {
            // Browser.
            result = window.prompt('Input: ');  // returns null on cancel
            if (result !== null) {
              result += '\n';
            }
          } else if (typeof readline == 'function') {
            // Command line.
            result = readline();
            if (result !== null) {
              result += '\n';
            }
          }
          if (!result) {
            return null;
          }
          tty.input = intArrayFromString(result, true);
        }
        return tty.input.shift();
      },
      put_char: function(tty, val) {
        if (val === null || val === ( charCode('\n') )) {
          out(UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        } else {
          if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
        }
      },
      flush: function(tty) {
        if (tty.output && tty.output.length > 0) {
          out(UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        }
      }
    },
    default_tty1_ops: {
      put_char: function(tty, val) {
        if (val === null || val === ( charCode('\n') )) {
          err(UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        } else {
          if (val != 0) tty.output.push(val);
        }
      },
      flush: function(tty) {
        if (tty.output && tty.output.length > 0) {
          err(UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        }
      }
    }
  }
});
// Copyright 2013 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

mergeInto(LibraryManager.library, {
  $FS__deps: ['__setErrNo', '$PATH', '$PATH_FS', '$TTY', '$MEMFS',
    ],
  $FS__postset: function() {
    // TODO: do we need noFSInit?
    addAtInit('if (!Module["noFSInit"] && !FS.init.initialized) FS.init();');
    addAtMain('FS.ignorePermissions = false;');
    addAtExit('FS.quit();');
    return 'FS.staticInit();' +
           // Get module methods from settings
           '';
  },
  $FS: {
    root: null,
    mounts: [],
    devices: {},
    streams: [],
    nextInode: 1,
    nameTable: null,
    currentPath: '/',
    initialized: false,
    // Whether we are currently ignoring permissions. Useful when preparing the
    // filesystem and creating files inside read-only folders.
    // This is set to false when the runtime is initialized, allowing you
    // to modify the filesystem freely before run() is called.
    ignorePermissions: true,
    trackingDelegate: {},
    tracking: {
      openFlags: {
        READ: 1 << 0,
        WRITE: 1 << 1
      }
    },
    ErrnoError: null, // set during init
    genericErrors: {},
    filesystems: null,
    syncFSRequests: 0, // we warn if there are multiple in flight at once

    handleFSError: function(e) {
      if (!(e instanceof FS.ErrnoError)) throw e + ' : ' + stackTrace();
      return ___setErrNo(e.errno);
    },

    //
    // paths
    //
    lookupPath: function(path, opts) {
      path = PATH_FS.resolve(FS.cwd(), path);
      opts = opts || {};

      if (!path) return { path: '', node: null };

      var defaults = {
        follow_mount: true,
        recurse_count: 0
      };
      for (var key in defaults) {
        if (opts[key] === undefined) {
          opts[key] = defaults[key];
        }
      }

      if (opts.recurse_count > 8) {  // max recursive lookup of 8
        throw new FS.ErrnoError(( cDefine('ELOOP') ));
      }

      // split the path
      var parts = PATH.normalizeArray(path.split('/').filter(function(p) {
        return !!p;
      }), false);

      // start at the root
      var current = FS.root;
      var current_path = '/';

      for (var i = 0; i < parts.length; i++) {
        var islast = (i === parts.length-1);
        if (islast && opts.parent) {
          // stop resolving
          break;
        }

        current = FS.lookupNode(current, parts[i]);
        current_path = PATH.join2(current_path, parts[i]);

        // jump to the mount's root node if this is a mountpoint
        if (FS.isMountpoint(current)) {
          if (!islast || (islast && opts.follow_mount)) {
            current = current.mounted.root;
          }
        }

        // by default, lookupPath will not follow a symlink if it is the final path component.
        // setting opts.follow = true will override this behavior.
        if (!islast || opts.follow) {
          var count = 0;
          while (FS.isLink(current.mode)) {
            var link = FS.readlink(current_path);
            current_path = PATH_FS.resolve(PATH.dirname(current_path), link);

            var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
            current = lookup.node;

            if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
              throw new FS.ErrnoError(( cDefine('ELOOP') ));
            }
          }
        }
      }

      return { path: current_path, node: current };
    },
    getPath: function(node) {
      var path;
      while (true) {
        if (FS.isRoot(node)) {
          var mount = node.mount.mountpoint;
          if (!path) return mount;
          return mount[mount.length-1] !== '/' ? mount + '/' + path : mount + path;
        }
        path = path ? node.name + '/' + path : node.name;
        node = node.parent;
      }
    },

    //
    // nodes
    //
    hashName: function(parentid, name) {
      var hash = 0;


      for (var i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
      }
      return ((parentid + hash) >>> 0) % FS.nameTable.length;
    },
    hashAddNode: function(node) {
      var hash = FS.hashName(node.parent.id, node.name);
      node.name_next = FS.nameTable[hash];
      FS.nameTable[hash] = node;
    },
    hashRemoveNode: function(node) {
      var hash = FS.hashName(node.parent.id, node.name);
      if (FS.nameTable[hash] === node) {
        FS.nameTable[hash] = node.name_next;
      } else {
        var current = FS.nameTable[hash];
        while (current) {
          if (current.name_next === node) {
            current.name_next = node.name_next;
            break;
          }
          current = current.name_next;
        }
      }
    },
    lookupNode: function(parent, name) {
      var err = FS.mayLookup(parent);
      if (err) {
        throw new FS.ErrnoError(err, parent);
      }
      var hash = FS.hashName(parent.id, name);
      for (var node = FS.nameTable[hash]; node; node = node.name_next) {
        var nodeName = node.name;
        if (node.parent.id === parent.id && nodeName === name) {
          return node;
        }
      }
      // if we failed to find it in the cache, call into the VFS
      return FS.lookup(parent, name);
    },
    createNode: function(parent, name, mode, rdev) {
      if (!FS.FSNode) {
        FS.FSNode = function(parent, name, mode, rdev) {
          if (!parent) {
            parent = this;  // root node sets parent to itself
          }
          this.parent = parent;
          this.mount = parent.mount;
          this.mounted = null;
          this.id = FS.nextInode++;
          this.name = name;
          this.mode = mode;
          this.node_ops = {};
          this.stream_ops = {};
          this.rdev = rdev;
        };

        FS.FSNode.prototype = {};

        // compatibility
        var readMode = ( cDefine('S_IRUGO') ) | ( cDefine('S_IXUGO') );
        var writeMode = ( cDefine('S_IWUGO') );

        // NOTE we must use Object.defineProperties instead of individual calls to
        // Object.defineProperty in order to make closure compiler happy
        Object.defineProperties(FS.FSNode.prototype, {
          read: {
            get: function() { return (this.mode & readMode) === readMode; },
            set: function(val) { val ? this.mode |= readMode : this.mode &= ~readMode; }
          },
          write: {
            get: function() { return (this.mode & writeMode) === writeMode; },
            set: function(val) { val ? this.mode |= writeMode : this.mode &= ~writeMode; }
          },
          isFolder: {
            get: function() { return FS.isDir(this.mode); }
          },
          isDevice: {
            get: function() { return FS.isChrdev(this.mode); }
          }
        });
      }

      var node = new FS.FSNode(parent, name, mode, rdev);

      FS.hashAddNode(node);

      return node;
    },
    destroyNode: function(node) {
      FS.hashRemoveNode(node);
    },
    isRoot: function(node) {
      return node === node.parent;
    },
    isMountpoint: function(node) {
      return !!node.mounted;
    },
    isFile: function(mode) {
      return (mode & ( cDefine('S_IFMT') )) === ( cDefine('S_IFREG') );
    },
    isDir: function(mode) {
      return (mode & ( cDefine('S_IFMT') )) === ( cDefine('S_IFDIR') );
    },
    isLink: function(mode) {
      return (mode & ( cDefine('S_IFMT') )) === ( cDefine('S_IFLNK') );
    },
    isChrdev: function(mode) {
      return (mode & ( cDefine('S_IFMT') )) === ( cDefine('S_IFCHR') );
    },
    isBlkdev: function(mode) {
      return (mode & ( cDefine('S_IFMT') )) === ( cDefine('S_IFBLK') );
    },
    isFIFO: function(mode) {
      return (mode & ( cDefine('S_IFMT') )) === ( cDefine('S_IFIFO') );
    },
    isSocket: function(mode) {
      return (mode & ( cDefine('S_IFSOCK') )) === ( cDefine('S_IFSOCK') );
    },

    //
    // permissions
    //
    flagModes: {
      'r': ( cDefine('O_RDONLY') ),
      'rs': ( cDefine('O_RDONLY') ) | ( cDefine('O_SYNC') ),
      'r+': ( cDefine('O_RDWR') ),
      'w': ( cDefine('O_TRUNC') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_WRONLY') ),
      'wx': ( cDefine('O_TRUNC') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_WRONLY') ) | ( cDefine('O_EXCL') ),
      'xw': ( cDefine('O_TRUNC') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_WRONLY') ) | ( cDefine('O_EXCL') ),
      'w+': ( cDefine('O_TRUNC') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_RDWR') ),
      'wx+': ( cDefine('O_TRUNC') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_RDWR') ) | ( cDefine('O_EXCL') ),
      'xw+': ( cDefine('O_TRUNC') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_RDWR') ) | ( cDefine('O_EXCL') ),
      'a': ( cDefine('O_APPEND') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_WRONLY') ),
      'ax': ( cDefine('O_APPEND') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_WRONLY') ) | ( cDefine('O_EXCL') ),
      'xa': ( cDefine('O_APPEND') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_WRONLY') ) | ( cDefine('O_EXCL') ),
      'a+': ( cDefine('O_APPEND') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_RDWR') ),
      'ax+': ( cDefine('O_APPEND') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_RDWR') ) | ( cDefine('O_EXCL') ),
      'xa+': ( cDefine('O_APPEND') ) | ( cDefine('O_CREAT') ) | ( cDefine('O_RDWR') ) | ( cDefine('O_EXCL') )
    },
    // convert the 'r', 'r+', etc. to it's corresponding set of O_* flags
    modeStringToFlags: function(str) {
      var flags = FS.flagModes[str];
      if (typeof flags === 'undefined') {
        throw new Error('Unknown file open mode: ' + str);
      }
      return flags;
    },
    // convert O_* bitmask to a string for nodePermissions
    flagsToPermissionString: function(flag) {
      var perms = ['r', 'w', 'rw'][flag & 3];
      if ((flag & ( cDefine('O_TRUNC') ))) {
        perms += 'w';
      }
      return perms;
    },
    nodePermissions: function(node, perms) {
      if (FS.ignorePermissions) {
        return 0;
      }
      // return 0 if any user, group or owner bits are set.
      if (perms.indexOf('r') !== -1 && !(node.mode & ( cDefine('S_IRUGO') ))) {
        return ( cDefine('EACCES') );
      } else if (perms.indexOf('w') !== -1 && !(node.mode & ( cDefine('S_IWUGO') ))) {
        return ( cDefine('EACCES') );
      } else if (perms.indexOf('x') !== -1 && !(node.mode & ( cDefine('S_IXUGO') ))) {
        return ( cDefine('EACCES') );
      }
      return 0;
    },
    mayLookup: function(dir) {
      var err = FS.nodePermissions(dir, 'x');
      if (err) return err;
      if (!dir.node_ops.lookup) return ( cDefine('EACCES') );
      return 0;
    },
    mayCreate: function(dir, name) {
      try {
        var node = FS.lookupNode(dir, name);
        return ( cDefine('EEXIST') );
      } catch (e) {
      }
      return FS.nodePermissions(dir, 'wx');
    },
    mayDelete: function(dir, name, isdir) {
      var node;
      try {
        node = FS.lookupNode(dir, name);
      } catch (e) {
        return e.errno;
      }
      var err = FS.nodePermissions(dir, 'wx');
      if (err) {
        return err;
      }
      if (isdir) {
        if (!FS.isDir(node.mode)) {
          return ( cDefine('ENOTDIR') );
        }
        if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
          return ( cDefine('EBUSY') );
        }
      } else {
        if (FS.isDir(node.mode)) {
          return ( cDefine('EISDIR') );
        }
      }
      return 0;
    },
    mayOpen: function(node, flags) {
      if (!node) {
        return ( cDefine('ENOENT') );
      }
      if (FS.isLink(node.mode)) {
        return ( cDefine('ELOOP') );
      } else if (FS.isDir(node.mode)) {
        if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
            (flags & ( cDefine('O_TRUNC') ))) { // TODO: check for O_SEARCH? (== search for dir only)
          return ( cDefine('EISDIR') );
        }
      }
      return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
    },

    //
    // streams
    //
    MAX_OPEN_FDS: 4096,
    nextfd: function(fd_start, fd_end) {
      fd_start = fd_start || 0;
      fd_end = fd_end || FS.MAX_OPEN_FDS;
      for (var fd = fd_start; fd <= fd_end; fd++) {
        if (!FS.streams[fd]) {
          return fd;
        }
      }
      throw new FS.ErrnoError(( cDefine('EMFILE') ));
    },
    getStream: function(fd) {
      return FS.streams[fd];
    },
    // TODO parameterize this function such that a stream
    // object isn't directly passed in. not possible until
    // SOCKFS is completed.
    createStream: function(stream, fd_start, fd_end) {
      if (!FS.FSStream) {
        FS.FSStream = function(){};
        FS.FSStream.prototype = {};
        // compatibility
        Object.defineProperties(FS.FSStream.prototype, {
          object: {
            get: function() { return this.node; },
            set: function(val) { this.node = val; }
          },
          isRead: {
            get: function() { return (this.flags & ( cDefine('O_ACCMODE') )) !== ( cDefine('O_WRONLY') ); }
          },
          isWrite: {
            get: function() { return (this.flags & ( cDefine('O_ACCMODE') )) !== ( cDefine('O_RDONLY') ); }
          },
          isAppend: {
            get: function() { return (this.flags & ( cDefine('O_APPEND') )); }
          }
        });
      }
      // clone it, so we can return an instance of FSStream
      var newStream = new FS.FSStream();
      for (var p in stream) {
        newStream[p] = stream[p];
      }
      stream = newStream;
      var fd = FS.nextfd(fd_start, fd_end);
      stream.fd = fd;
      FS.streams[fd] = stream;
      return stream;
    },
    closeStream: function(fd) {
      FS.streams[fd] = null;
    },

    //
    // devices
    //
    // each character device consists of a device id + stream operations.
    // when a character device node is created (e.g. /dev/stdin) it is
    // assigned a device id that lets us map back to the actual device.
    // by default, each character device stream (e.g. _stdin) uses chrdev_stream_ops.
    // however, once opened, the stream's operations are overridden with
    // the operations of the device its underlying node maps back to.
    chrdev_stream_ops: {
      open: function(stream) {
        var device = FS.getDevice(stream.node.rdev);
        // override node's stream ops with the device's
        stream.stream_ops = device.stream_ops;
        // forward the open call
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
      },
      llseek: function() {
        throw new FS.ErrnoError(( cDefine('ESPIPE') ));
      }
    },
    major: function(dev) {
      return ((dev) >> 8);
    },
    minor: function(dev) {
      return ((dev) & 0xff);
    },
    makedev: function(ma, mi) {
      return ((ma) << 8 | (mi));
    },
    registerDevice: function(dev, ops) {
      FS.devices[dev] = { stream_ops: ops };
    },
    getDevice: function(dev) {
      return FS.devices[dev];
    },

    //
    // core
    //
    getMounts: function(mount) {
      var mounts = [];
      var check = [mount];

      while (check.length) {
        var m = check.pop();

        mounts.push(m);

        check.push.apply(check, m.mounts);
      }

      return mounts;
    },
    syncfs: function(populate, callback) {
      if (typeof(populate) === 'function') {
        callback = populate;
        populate = false;
      }

      FS.syncFSRequests++;

      if (FS.syncFSRequests > 1) {
        console.log('warning: ' + FS.syncFSRequests + ' FS.syncfs operations in flight at once, probably just doing extra work');
      }

      var mounts = FS.getMounts(FS.root.mount);
      var completed = 0;

      function doCallback(err) {
        FS.syncFSRequests--;
        return callback(err);
      }

      function done(err) {
        if (err) {
          if (!done.errored) {
            done.errored = true;
            return doCallback(err);
          }
          return;
        }
        if (++completed >= mounts.length) {
          doCallback(null);
        }
      };

      // sync all mounts
      mounts.forEach(function (mount) {
        if (!mount.type.syncfs) {
          return done(null);
        }
        mount.type.syncfs(mount, populate, done);
      });
    },
    mount: function(type, opts, mountpoint) {
      var root = mountpoint === '/';
      var pseudo = !mountpoint;
      var node;

      if (root && FS.root) {
        throw new FS.ErrnoError(( cDefine('EBUSY') ));
      } else if (!root && !pseudo) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });

        mountpoint = lookup.path;  // use the absolute path
        node = lookup.node;

        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(( cDefine('EBUSY') ));
        }

        if (!FS.isDir(node.mode)) {
          throw new FS.ErrnoError(( cDefine('ENOTDIR') ));
        }
      }

      var mount = {
        type: type,
        opts: opts,
        mountpoint: mountpoint,
        mounts: []
      };

      // create a root node for the fs
      var mountRoot = type.mount(mount);
      mountRoot.mount = mount;
      mount.root = mountRoot;

      if (root) {
        FS.root = mountRoot;
      } else if (node) {
        // set as a mountpoint
        node.mounted = mount;

        // add the new mount to the current mount's children
        if (node.mount) {
          node.mount.mounts.push(mount);
        }
      }

      return mountRoot;
    },
    unmount: function (mountpoint) {
      var lookup = FS.lookupPath(mountpoint, { follow_mount: false });

      if (!FS.isMountpoint(lookup.node)) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }

      // destroy the nodes for this mount, and all its child mounts
      var node = lookup.node;
      var mount = node.mounted;
      var mounts = FS.getMounts(mount);

      Object.keys(FS.nameTable).forEach(function (hash) {
        var current = FS.nameTable[hash];

        while (current) {
          var next = current.name_next;

          if (mounts.indexOf(current.mount) !== -1) {
            FS.destroyNode(current);
          }

          current = next;
        }
      });

      // no longer a mountpoint
      node.mounted = null;

      // remove this mount from the child mounts
      var idx = node.mount.mounts.indexOf(mount);
      node.mount.mounts.splice(idx, 1);
    },
    lookup: function(parent, name) {
      return parent.node_ops.lookup(parent, name);
    },
    // generic function for all node creation
    mknod: function(path, mode, dev) {
      var lookup = FS.lookupPath(path, { parent: true });
      var parent = lookup.node;
      var name = PATH.basename(path);
      if (!name || name === '.' || name === '..') {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      var err = FS.mayCreate(parent, name);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      if (!parent.node_ops.mknod) {
        throw new FS.ErrnoError(( cDefine('EPERM') ));
      }
      return parent.node_ops.mknod(parent, name, mode, dev);
    },
    // helpers to create specific types of nodes
    create: function(path, mode) {
      mode = mode !== undefined ? mode : 438 /* 0666 */;
      mode &= ( cDefine('S_IALLUGO') );
      mode |= ( cDefine('S_IFREG') );
      return FS.mknod(path, mode, 0);
    },
    mkdir: function(path, mode) {
      mode = mode !== undefined ? mode : 511 /* 0777 */;
      mode &= ( cDefine('S_IRWXUGO') ) | ( cDefine('S_ISVTX') );
      mode |= ( cDefine('S_IFDIR') );
      return FS.mknod(path, mode, 0);
    },
    // Creates a whole directory tree chain if it doesn't yet exist
    mkdirTree: function(path, mode) {
      var dirs = path.split('/');
      var d = '';
      for (var i = 0; i < dirs.length; ++i) {
        if (!dirs[i]) continue;
        d += '/' + dirs[i];
        try {
          FS.mkdir(d, mode);
        } catch(e) {
          if (e.errno != ( cDefine('EEXIST') )) throw e;
        }
      }
    },
    mkdev: function(path, mode, dev) {
      if (typeof(dev) === 'undefined') {
        dev = mode;
        mode = 438 /* 0666 */;
      }
      mode |= ( cDefine('S_IFCHR') );
      return FS.mknod(path, mode, dev);
    },
    symlink: function(oldpath, newpath) {
      if (!PATH_FS.resolve(oldpath)) {
        throw new FS.ErrnoError(( cDefine('ENOENT') ));
      }
      var lookup = FS.lookupPath(newpath, { parent: true });
      var parent = lookup.node;
      if (!parent) {
        throw new FS.ErrnoError(( cDefine('ENOENT') ));
      }
      var newname = PATH.basename(newpath);
      var err = FS.mayCreate(parent, newname);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      if (!parent.node_ops.symlink) {
        throw new FS.ErrnoError(( cDefine('EPERM') ));
      }
      return parent.node_ops.symlink(parent, newname, oldpath);
    },
    rename: function(old_path, new_path) {
      var old_dirname = PATH.dirname(old_path);
      var new_dirname = PATH.dirname(new_path);
      var old_name = PATH.basename(old_path);
      var new_name = PATH.basename(new_path);
      // parents must exist
      var lookup, old_dir, new_dir;
      try {
        lookup = FS.lookupPath(old_path, { parent: true });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, { parent: true });
        new_dir = lookup.node;
      } catch (e) {
        throw new FS.ErrnoError(( cDefine('EBUSY') ));
      }
      if (!old_dir || !new_dir) throw new FS.ErrnoError(( cDefine('ENOENT') ));
      // need to be part of the same mount
      if (old_dir.mount !== new_dir.mount) {
        throw new FS.ErrnoError(( cDefine('EXDEV') ));
      }
      // source must exist
      var old_node = FS.lookupNode(old_dir, old_name);
      // old path should not be an ancestor of the new path
      var relative = PATH_FS.relative(old_path, new_dirname);
      if (relative.charAt(0) !== '.') {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      // new path should not be an ancestor of the old path
      relative = PATH_FS.relative(new_path, old_dirname);
      if (relative.charAt(0) !== '.') {
        throw new FS.ErrnoError(( cDefine('ENOTEMPTY') ));
      }
      // see if the new path already exists
      var new_node;
      try {
        new_node = FS.lookupNode(new_dir, new_name);
      } catch (e) {
        // not fatal
      }
      // early out if nothing needs to change
      if (old_node === new_node) {
        return;
      }
      // we'll need to delete the old entry
      var isdir = FS.isDir(old_node.mode);
      var err = FS.mayDelete(old_dir, old_name, isdir);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      // need delete permissions if we'll be overwriting.
      // need create permissions if new doesn't already exist.
      err = new_node ?
        FS.mayDelete(new_dir, new_name, isdir) :
        FS.mayCreate(new_dir, new_name);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      if (!old_dir.node_ops.rename) {
        throw new FS.ErrnoError(( cDefine('EPERM') ));
      }
      if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
        throw new FS.ErrnoError(( cDefine('EBUSY') ));
      }
      // if we are going to change the parent, check write permissions
      if (new_dir !== old_dir) {
        err = FS.nodePermissions(old_dir, 'w');
        if (err) {
          throw new FS.ErrnoError(err);
        }
      }
      try {
        if (FS.trackingDelegate['willMovePath']) {
          FS.trackingDelegate['willMovePath'](old_path, new_path);
        }
      } catch(e) {
        console.log("FS.trackingDelegate['willMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
      }
      // remove the node from the lookup hash
      FS.hashRemoveNode(old_node);
      // do the underlying fs rename
      try {
        old_dir.node_ops.rename(old_node, new_dir, new_name);
      } catch (e) {
        throw e;
      } finally {
        // add the node back to the hash (in case node_ops.rename
        // changed its name)
        FS.hashAddNode(old_node);
      }
      try {
        if (FS.trackingDelegate['onMovePath']) FS.trackingDelegate['onMovePath'](old_path, new_path);
      } catch(e) {
        console.log("FS.trackingDelegate['onMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
      }
    },
    rmdir: function(path) {
      var lookup = FS.lookupPath(path, { parent: true });
      var parent = lookup.node;
      var name = PATH.basename(path);
      var node = FS.lookupNode(parent, name);
      var err = FS.mayDelete(parent, name, true);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      if (!parent.node_ops.rmdir) {
        throw new FS.ErrnoError(( cDefine('EPERM') ));
      }
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(( cDefine('EBUSY') ));
      }
      try {
        if (FS.trackingDelegate['willDeletePath']) {
          FS.trackingDelegate['willDeletePath'](path);
        }
      } catch(e) {
        console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
      }
      parent.node_ops.rmdir(parent, name);
      FS.destroyNode(node);
      try {
        if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
      } catch(e) {
        console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
      }
    },
    readdir: function(path) {
      var lookup = FS.lookupPath(path, { follow: true });
      var node = lookup.node;
      if (!node.node_ops.readdir) {
        throw new FS.ErrnoError(( cDefine('ENOTDIR') ));
      }
      return node.node_ops.readdir(node);
    },
    unlink: function(path) {
      var lookup = FS.lookupPath(path, { parent: true });
      var parent = lookup.node;
      var name = PATH.basename(path);
      var node = FS.lookupNode(parent, name);
      var err = FS.mayDelete(parent, name, false);
      if (err) {
        // According to POSIX, we should map EISDIR to EPERM, but
        // we instead do what Linux does (and we must, as we use
        // the musl linux libc).
        throw new FS.ErrnoError(err);
      }
      if (!parent.node_ops.unlink) {
        throw new FS.ErrnoError(( cDefine('EPERM') ));
      }
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(( cDefine('EBUSY') ));
      }
      try {
        if (FS.trackingDelegate['willDeletePath']) {
          FS.trackingDelegate['willDeletePath'](path);
        }
      } catch(e) {
        console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
      }
      parent.node_ops.unlink(parent, name);
      FS.destroyNode(node);
      try {
        if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
      } catch(e) {
        console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
      }
    },
    readlink: function(path) {
      var lookup = FS.lookupPath(path);
      var link = lookup.node;
      if (!link) {
        throw new FS.ErrnoError(( cDefine('ENOENT') ));
      }
      if (!link.node_ops.readlink) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
    },
    stat: function(path, dontFollow) {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      var node = lookup.node;
      if (!node) {
        throw new FS.ErrnoError(( cDefine('ENOENT') ));
      }
      if (!node.node_ops.getattr) {
        throw new FS.ErrnoError(( cDefine('EPERM') ));
      }
      return node.node_ops.getattr(node);
    },
    lstat: function(path) {
      return FS.stat(path, true);
    },
    chmod: function(path, mode, dontFollow) {
      var node;
      if (typeof path === 'string') {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        node = lookup.node;
      } else {
        node = path;
      }
      if (!node.node_ops.setattr) {
        throw new FS.ErrnoError(( cDefine('EPERM') ));
      }
      node.node_ops.setattr(node, {
        mode: (mode & ( cDefine('S_IALLUGO') )) | (node.mode & ~( cDefine('S_IALLUGO') )),
        timestamp: Date.now()
      });
    },
    lchmod: function(path, mode) {
      FS.chmod(path, mode, true);
    },
    fchmod: function(fd, mode) {
      var stream = FS.getStream(fd);
      if (!stream) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      FS.chmod(stream.node, mode);
    },
    chown: function(path, uid, gid, dontFollow) {
      var node;
      if (typeof path === 'string') {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        node = lookup.node;
      } else {
        node = path;
      }
      if (!node.node_ops.setattr) {
        throw new FS.ErrnoError(( cDefine('EPERM') ));
      }
      node.node_ops.setattr(node, {
        timestamp: Date.now()
        // we ignore the uid / gid for now
      });
    },
    lchown: function(path, uid, gid) {
      FS.chown(path, uid, gid, true);
    },
    fchown: function(fd, uid, gid) {
      var stream = FS.getStream(fd);
      if (!stream) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      FS.chown(stream.node, uid, gid);
    },
    truncate: function(path, len) {
      if (len < 0) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      var node;
      if (typeof path === 'string') {
        var lookup = FS.lookupPath(path, { follow: true });
        node = lookup.node;
      } else {
        node = path;
      }
      if (!node.node_ops.setattr) {
        throw new FS.ErrnoError(( cDefine('EPERM') ));
      }
      if (FS.isDir(node.mode)) {
        throw new FS.ErrnoError(( cDefine('EISDIR') ));
      }
      if (!FS.isFile(node.mode)) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      var err = FS.nodePermissions(node, 'w');
      if (err) {
        throw new FS.ErrnoError(err);
      }
      node.node_ops.setattr(node, {
        size: len,
        timestamp: Date.now()
      });
    },
    ftruncate: function(fd, len) {
      var stream = FS.getStream(fd);
      if (!stream) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      if ((stream.flags & ( cDefine('O_ACCMODE') )) === ( cDefine('O_RDONLY'))) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      FS.truncate(stream.node, len);
    },
    utime: function(path, atime, mtime) {
      var lookup = FS.lookupPath(path, { follow: true });
      var node = lookup.node;
      node.node_ops.setattr(node, {
        timestamp: Math.max(atime, mtime)
      });
    },
    open: function(path, flags, mode, fd_start, fd_end) {
      if (path === "") {
        throw new FS.ErrnoError(( cDefine('ENOENT') ));
      }
      flags = typeof flags === 'string' ? FS.modeStringToFlags(flags) : flags;
      mode = typeof mode === 'undefined' ? 438 /* 0666 */ : mode;
      if ((flags & ( cDefine('O_CREAT') ))) {
        mode = (mode & ( cDefine('S_IALLUGO') )) | ( cDefine('S_IFREG') );
      } else {
        mode = 0;
      }
      var node;
      if (typeof path === 'object') {
        node = path;
      } else {
        path = PATH.normalize(path);
        try {
          var lookup = FS.lookupPath(path, {
            follow: !(flags & ( cDefine('O_NOFOLLOW') ))
          });
          node = lookup.node;
        } catch (e) {
          // ignore
        }
      }
      // perhaps we need to create the node
      var created = false;
      if ((flags & ( cDefine('O_CREAT') ))) {
        if (node) {
          // if O_CREAT and O_EXCL are set, error out if the node already exists
          if ((flags & ( cDefine('O_EXCL') ))) {
            throw new FS.ErrnoError(( cDefine('EEXIST') ));
          }
        } else {
          // node doesn't exist, try to create it
          node = FS.mknod(path, mode, 0);
          created = true;
        }
      }
      if (!node) {
        throw new FS.ErrnoError(( cDefine('ENOENT') ));
      }
      // can't truncate a device
      if (FS.isChrdev(node.mode)) {
        flags &= ~( cDefine('O_TRUNC') );
      }
      // if asked only for a directory, then this must be one
      if ((flags & ( cDefine('O_DIRECTORY') )) && !FS.isDir(node.mode)) {
        throw new FS.ErrnoError(( cDefine('ENOTDIR') ));
      }
      // check permissions, if this is not a file we just created now (it is ok to
      // create and write to a file with read-only permissions; it is read-only
      // for later use)
      if (!created) {
        var err = FS.mayOpen(node, flags);
        if (err) {
          throw new FS.ErrnoError(err);
        }
      }
      // do truncation if necessary
      if ((flags & ( cDefine('O_TRUNC')))) {
        FS.truncate(node, 0);
      }
      // we've already handled these, don't pass down to the underlying vfs
      flags &= ~(( cDefine('O_EXCL') ) | ( cDefine('O_TRUNC') ));

      // register the stream with the filesystem
      var stream = FS.createStream({
        node: node,
        path: FS.getPath(node),  // we want the absolute path to the node
        flags: flags,
        seekable: true,
        position: 0,
        stream_ops: node.stream_ops,
        // used by the file family libc calls (fopen, fwrite, ferror, etc.)
        ungotten: [],
        error: false
      }, fd_start, fd_end);
      // call the new stream's open function
      if (stream.stream_ops.open) {
        stream.stream_ops.open(stream);
      }
      if (Module['logReadFiles'] && !(flags & ( cDefine('O_WRONLY')))) {
        if (!FS.readFiles) FS.readFiles = {};
        if (!(path in FS.readFiles)) {
          FS.readFiles[path] = 1;
          console.log("FS.trackingDelegate error on read file: " + path);
        }
      }
      try {
        if (FS.trackingDelegate['onOpenFile']) {
          var trackingFlags = 0;
          if ((flags & ( cDefine('O_ACCMODE') )) !== ( cDefine('O_WRONLY') )) {
            trackingFlags |= FS.tracking.openFlags.READ;
          }
          if ((flags & ( cDefine('O_ACCMODE') )) !== ( cDefine('O_RDONLY') )) {
            trackingFlags |= FS.tracking.openFlags.WRITE;
          }
          FS.trackingDelegate['onOpenFile'](path, trackingFlags);
        }
      } catch(e) {
        console.log("FS.trackingDelegate['onOpenFile']('"+path+"', flags) threw an exception: " + e.message);
      }
      return stream;
    },
    close: function(stream) {
      if (FS.isClosed(stream)) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      if (stream.getdents) stream.getdents = null; // free readdir state
      try {
        if (stream.stream_ops.close) {
          stream.stream_ops.close(stream);
        }
      } catch (e) {
        throw e;
      } finally {
        FS.closeStream(stream.fd);
      }
      stream.fd = null;
    },
    isClosed: function(stream) {
      return stream.fd === null;
    },
    llseek: function(stream, offset, whence) {
      if (FS.isClosed(stream)) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      if (!stream.seekable || !stream.stream_ops.llseek) {
        throw new FS.ErrnoError(( cDefine('ESPIPE') ));
      }
      if (whence != ( cDefine('SEEK_SET') ) && whence != ( cDefine('SEEK_CUR') ) && whence != ( cDefine('SEEK_END') )) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      stream.position = stream.stream_ops.llseek(stream, offset, whence);
      stream.ungotten = [];
      return stream.position;
    },
    read: function(stream, buffer, offset, length, position) {
      if (length < 0 || position < 0) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      if (FS.isClosed(stream)) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      if ((stream.flags & ( cDefine('O_ACCMODE') )) === ( cDefine('O_WRONLY'))) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      if (FS.isDir(stream.node.mode)) {
        throw new FS.ErrnoError(( cDefine('EISDIR') ));
      }
      if (!stream.stream_ops.read) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      var seeking = typeof position !== 'undefined';
      if (!seeking) {
        position = stream.position;
      } else if (!stream.seekable) {
        throw new FS.ErrnoError(( cDefine('ESPIPE') ));
      }
      var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
      if (!seeking) stream.position += bytesRead;
      return bytesRead;
    },
    write: function(stream, buffer, offset, length, position, canOwn) {
      if (length < 0 || position < 0) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      if (FS.isClosed(stream)) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      if ((stream.flags & ( cDefine('O_ACCMODE') )) === ( cDefine('O_RDONLY'))) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      if (FS.isDir(stream.node.mode)) {
        throw new FS.ErrnoError(( cDefine('EISDIR') ));
      }
      if (!stream.stream_ops.write) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      if (stream.flags & ( cDefine('O_APPEND') )) {
        // seek to the end before writing in append mode
        FS.llseek(stream, 0, ( cDefine('SEEK_END') ));
      }
      var seeking = typeof position !== 'undefined';
      if (!seeking) {
        position = stream.position;
      } else if (!stream.seekable) {
        throw new FS.ErrnoError(( cDefine('ESPIPE') ));
      }
      var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
      if (!seeking) stream.position += bytesWritten;
      try {
        if (stream.path && FS.trackingDelegate['onWriteToFile']) FS.trackingDelegate['onWriteToFile'](stream.path);
      } catch(e) {
        console.log("FS.trackingDelegate['onWriteToFile']('"+stream.path+"') threw an exception: " + e.message);
      }
      return bytesWritten;
    },
    allocate: function(stream, offset, length) {
      if (FS.isClosed(stream)) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      if (offset < 0 || length <= 0) {
        throw new FS.ErrnoError(( cDefine('EINVAL') ));
      }
      if ((stream.flags & ( cDefine('O_ACCMODE') )) === ( cDefine('O_RDONLY'))) {
        throw new FS.ErrnoError(( cDefine('EBADF') ));
      }
      if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
        throw new FS.ErrnoError(( cDefine('ENODEV') ));
      }
      if (!stream.stream_ops.allocate) {
        throw new FS.ErrnoError(( cDefine('EOPNOTSUPP') ));
      }
      stream.stream_ops.allocate(stream, offset, length);
    },
    mmap: function(stream, buffer, offset, length, position, prot, flags) {
      // User requests writing to file (prot & PROT_WRITE != 0).
      // Checking if we have permissions to write to the file unless
      // MAP_PRIVATE flag is set. According to POSIX spec it is possible
      // to write to file opened in read-only mode with MAP_PRIVATE flag,
      // as all modifications will be visible only in the memory of
      // the current process.
      if ((prot & ( cDefine('PROT_WRITE') )) !== 0
          && (flags & ( cDefine('MAP_PRIVATE'))) === 0
          && (stream.flags & ( cDefine('O_ACCMODE') )) !== ( cDefine('O_RDWR'))) {
        throw new FS.ErrnoError(( cDefine('EACCES') ));
      }
      if ((stream.flags & ( cDefine('O_ACCMODE') )) === ( cDefine('O_WRONLY'))) {
        throw new FS.ErrnoError(( cDefine('EACCES') ));
      }
      if (!stream.stream_ops.mmap) {
        throw new FS.ErrnoError(( cDefine('ENODEV') ));
      }
      return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
    },
    msync: function(stream, buffer, offset, length, mmapFlags) {
      if (!stream || !stream.stream_ops.msync) {
        return 0;
      }
      return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
    },
    munmap: function(stream) {
      return 0;
    },
    ioctl: function(stream, cmd, arg) {
      if (!stream.stream_ops.ioctl) {
        throw new FS.ErrnoError(( cDefine('ENOTTY') ));
      }
      return stream.stream_ops.ioctl(stream, cmd, arg);
    },
    readFile: function(path, opts) {
      opts = opts || {};
      opts.flags = opts.flags || 'r';
      opts.encoding = opts.encoding || 'binary';
      if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
        throw new Error('Invalid encoding type "' + opts.encoding + '"');
      }
      var ret;
      var stream = FS.open(path, opts.flags);
      var stat = FS.stat(path);
      var length = stat.size;
      var buf = new Uint8Array(length);
      FS.read(stream, buf, 0, length, 0);
      if (opts.encoding === 'utf8') {
        ret = UTF8ArrayToString(buf, 0);
      } else if (opts.encoding === 'binary') {
        ret = buf;
      }
      FS.close(stream);
      return ret;
    },
    writeFile: function(path, data, opts) {
      opts = opts || {};
      opts.flags = opts.flags || 'w';
      var stream = FS.open(path, opts.flags, opts.mode);
      if (typeof data === 'string') {
        var buf = new Uint8Array(lengthBytesUTF8(data)+1);
        var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
        FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
      } else if (ArrayBuffer.isView(data)) {
        FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
      } else {
        throw new Error('Unsupported data type');
      }
      FS.close(stream);
    },

    //
    // module-level FS code
    //
    cwd: function() {
      return FS.currentPath;
    },
    chdir: function(path) {
      var lookup = FS.lookupPath(path, { follow: true });
      if (lookup.node === null) {
        throw new FS.ErrnoError(( cDefine('ENOENT') ));
      }
      if (!FS.isDir(lookup.node.mode)) {
        throw new FS.ErrnoError(( cDefine('ENOTDIR') ));
      }
      var err = FS.nodePermissions(lookup.node, 'x');
      if (err) {
        throw new FS.ErrnoError(err);
      }
      FS.currentPath = lookup.path;
    },
    createDefaultDirectories: function() {
      FS.mkdir('/tmp');
      FS.mkdir('/home');
      FS.mkdir('/home/web_user');
    },
    createDefaultDevices: function() {
      // create /dev
      FS.mkdir('/dev');
      // setup /dev/null
      FS.registerDevice(FS.makedev(1, 3), {
        read: function() { return 0; },
        write: function(stream, buffer, offset, length, pos) { return length; }
      });
      FS.mkdev('/dev/null', FS.makedev(1, 3));
      // setup /dev/tty and /dev/tty1
      // stderr needs to print output using Module['printErr']
      // so we register a second tty just for it.
      TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
      TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
      FS.mkdev('/dev/tty', FS.makedev(5, 0));
      FS.mkdev('/dev/tty1', FS.makedev(6, 0));
      // setup /dev/[u]random
      var random_device;
      if (typeof crypto === 'object' && typeof crypto['getRandomValues'] === 'function') {
        // for modern web browsers
        var randomBuffer = new Uint8Array(1);
        random_device = function() { crypto.getRandomValues(randomBuffer); return randomBuffer[0]; };
      } else
      {}
      if (!random_device) {
        // we couldn't find a proper implementation, as Math.random() is not suitable for /dev/random, see emscripten-core/emscripten/pull/7096
        random_device = function() { abort("random_device"); };
      }
      FS.createDevice('/dev', 'random', random_device);
      FS.createDevice('/dev', 'urandom', random_device);
      // we're not going to emulate the actual shm device,
      // just create the tmp dirs that reside in it commonly
      FS.mkdir('/dev/shm');
      FS.mkdir('/dev/shm/tmp');
    },
    createSpecialDirectories: function() {
      // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the name of the stream for fd 6 (see test_unistd_ttyname)
      FS.mkdir('/proc');
      FS.mkdir('/proc/self');
      FS.mkdir('/proc/self/fd');
      FS.mount({
        mount: function() {
          var node = FS.createNode('/proc/self', 'fd', ( cDefine('S_IFDIR') ) | 511 /* 0777 */, ( cDefine('S_IXUGO') ));
          node.node_ops = {
            lookup: function(parent, name) {
              var fd = +name;
              var stream = FS.getStream(fd);
              if (!stream) throw new FS.ErrnoError(( cDefine('EBADF') ));
              var ret = {
                parent: null,
                mount: { mountpoint: 'fake' },
                node_ops: { readlink: function() { return stream.path } }
              };
              ret.parent = ret; // make it look like a simple root node
              return ret;
            }
          };
          return node;
        }
      }, {}, '/proc/self/fd');
    },
    createStandardStreams: function() {
      // TODO deprecate the old functionality of a single
      // input / output callback and that utilizes FS.createDevice
      // and instead require a unique set of stream ops

      // by default, we symlink the standard streams to the
      // default tty devices. however, if the standard streams
      // have been overwritten we create a unique device for
      // them instead.
      if (Module['stdin']) {
        FS.createDevice('/dev', 'stdin', Module['stdin']);
      } else {
        FS.symlink('/dev/tty', '/dev/stdin');
      }
      if (Module['stdout']) {
        FS.createDevice('/dev', 'stdout', null, Module['stdout']);
      } else {
        FS.symlink('/dev/tty', '/dev/stdout');
      }
      if (Module['stderr']) {
        FS.createDevice('/dev', 'stderr', null, Module['stderr']);
      } else {
        FS.symlink('/dev/tty1', '/dev/stderr');
      }

      // open default streams for the stdin, stdout and stderr devices
      var stdin = FS.open('/dev/stdin', 'r');
      var stdout = FS.open('/dev/stdout', 'w');
      var stderr = FS.open('/dev/stderr', 'w');
    },
    ensureErrnoError: function() {
      if (FS.ErrnoError) return;
      FS.ErrnoError = function ErrnoError(errno, node) {
        this.node = node;
        this.setErrno = function(errno) {
          this.errno = errno;
        };
        this.setErrno(errno);
        this.message = 'FS error';

      };
      FS.ErrnoError.prototype = new Error();
      FS.ErrnoError.prototype.constructor = FS.ErrnoError;
      // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
      [( cDefine('ENOENT') )].forEach(function(code) {
        FS.genericErrors[code] = new FS.ErrnoError(code);
        FS.genericErrors[code].stack = '<generic error, no stack>';
      });
    },
    staticInit: function() {
      FS.ensureErrnoError();

      FS.nameTable = new Array(4096);

      FS.mount(MEMFS, {}, '/');

      FS.createDefaultDirectories();
      FS.createDefaultDevices();
      FS.createSpecialDirectories();

      FS.filesystems = {
        'MEMFS': MEMFS,
      };
    },
    init: function(input, output, error) {
      FS.init.initialized = true;

      FS.ensureErrnoError();

      // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
      Module['stdin'] = input || Module['stdin'];
      Module['stdout'] = output || Module['stdout'];
      Module['stderr'] = error || Module['stderr'];

      FS.createStandardStreams();
    },
    quit: function() {
      FS.init.initialized = false;
      // force-flush all streams, so we get musl std streams printed out
      var fflush = Module['_fflush'];
      if (fflush) fflush(0);
      // close all of our streams
      for (var i = 0; i < FS.streams.length; i++) {
        var stream = FS.streams[i];
        if (!stream) {
          continue;
        }
        FS.close(stream);
      }
    },

    //
    // old v1 compatibility functions
    //
    getMode: function(canRead, canWrite) {
      var mode = 0;
      if (canRead) mode |= ( cDefine('S_IRUGO') ) | ( cDefine('S_IXUGO') );
      if (canWrite) mode |= ( cDefine('S_IWUGO') );
      return mode;
    },
    joinPath: function(parts, forceRelative) {
      var path = PATH.join.apply(null, parts);
      if (forceRelative && path[0] == '/') path = path.substr(1);
      return path;
    },
    absolutePath: function(relative, base) {
      return PATH_FS.resolve(base, relative);
    },
    standardizePath: function(path) {
      return PATH.normalize(path);
    },
    findObject: function(path, dontResolveLastLink) {
      var ret = FS.analyzePath(path, dontResolveLastLink);
      if (ret.exists) {
        return ret.object;
      } else {
        ___setErrNo(ret.error);
        return null;
      }
    },
    analyzePath: function(path, dontResolveLastLink) {
      // operate from within the context of the symlink's target
      try {
        var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
        path = lookup.path;
      } catch (e) {
      }
      var ret = {
        isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
        parentExists: false, parentPath: null, parentObject: null
      };
      try {
        var lookup = FS.lookupPath(path, { parent: true });
        ret.parentExists = true;
        ret.parentPath = lookup.path;
        ret.parentObject = lookup.node;
        ret.name = PATH.basename(path);
        lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
        ret.exists = true;
        ret.path = lookup.path;
        ret.object = lookup.node;
        ret.name = lookup.node.name;
        ret.isRoot = lookup.path === '/';
      } catch (e) {
        ret.error = e.errno;
      };
      return ret;
    },
    createFolder: function(parent, name, canRead, canWrite) {
      var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
      var mode = FS.getMode(canRead, canWrite);
      return FS.mkdir(path, mode);
    },
    createPath: function(parent, path, canRead, canWrite) {
      parent = typeof parent === 'string' ? parent : FS.getPath(parent);
      var parts = path.split('/').reverse();
      while (parts.length) {
        var part = parts.pop();
        if (!part) continue;
        var current = PATH.join2(parent, part);
        try {
          FS.mkdir(current);
        } catch (e) {
          // ignore EEXIST
        }
        parent = current;
      }
      return current;
    },
    createFile: function(parent, name, properties, canRead, canWrite) {
      var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
      var mode = FS.getMode(canRead, canWrite);
      return FS.create(path, mode);
    },
    createDataFile: function(parent, name, data, canRead, canWrite, canOwn) {
      var path = name ? PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name) : parent;
      var mode = FS.getMode(canRead, canWrite);
      var node = FS.create(path, mode);
      if (data) {
        if (typeof data === 'string') {
          var arr = new Array(data.length);
          for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
          data = arr;
        }
        // make sure we can write to the file
        FS.chmod(node, mode | ( cDefine('S_IWUGO') ));
        var stream = FS.open(node, 'w');
        FS.write(stream, data, 0, data.length, 0, canOwn);
        FS.close(stream);
        FS.chmod(node, mode);
      }
      return node;
    },
    createDevice: function(parent, name, input, output) {
      var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
      var mode = FS.getMode(!!input, !!output);
      if (!FS.createDevice.major) FS.createDevice.major = 64;
      var dev = FS.makedev(FS.createDevice.major++, 0);
      // Create a fake device that a set of stream ops to emulate
      // the old behavior.
      FS.registerDevice(dev, {
        open: function(stream) {
          stream.seekable = false;
        },
        close: function(stream) {
          // flush any pending line data
          if (output && output.buffer && output.buffer.length) {
            output(( charCode('\n') ));
          }
        },
        read: function(stream, buffer, offset, length, pos /* ignored */) {
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = input();
            } catch (e) {
              throw new FS.ErrnoError(( cDefine('EIO') ));
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(( cDefine('EAGAIN') ));
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },
        write: function(stream, buffer, offset, length, pos) {
          for (var i = 0; i < length; i++) {
            try {
              output(buffer[offset+i]);
            } catch (e) {
              throw new FS.ErrnoError(( cDefine('EIO') ));
            }
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        }
      });
      return FS.mkdev(path, mode, dev);
    },
    createLink: function(parent, name, target, canRead, canWrite) {
      var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
      return FS.symlink(target, path);
    },
    // Makes sure a file's contents are loaded. Returns whether the file has
    // been loaded successfully. No-op for files that have been loaded already.
    forceLoadFile: function(obj) {
      if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
      var success = true;
      if (typeof XMLHttpRequest !== 'undefined') {
        throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
      } else if (read_) {
        // Command-line.
        try {
          // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
          //          read() will try to parse UTF8.
          obj.contents = intArrayFromString(read_(obj.url), true);
          obj.usedBytes = obj.contents.length;
        } catch (e) {
          success = false;
        }
      } else {
        throw new Error('Cannot load without read() or XMLHttpRequest.');
      }
      if (!success) ___setErrNo(( cDefine('EIO') ));
      return success;
    },
    // Creates a file record for lazy-loading from a URL. XXX This requires a synchronous
    // XHR, which is not possible in browsers except in a web worker! Use preloading,
    // either --preload-file in emcc or FS.createPreloadedFile
    createLazyFile: function(parent, name, url, canRead, canWrite) {
      // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
      function LazyUint8Array() {
        this.lengthKnown = false;
        this.chunks = []; // Loaded chunks. Index is the chunk number
      }
      LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
        if (idx > this.length-1 || idx < 0) {
          return undefined;
        }
        var chunkOffset = idx % this.chunkSize;
        var chunkNum = (idx / this.chunkSize)|0;
        return this.getter(chunkNum)[chunkOffset];
      };
      LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
        this.getter = getter;
      };
      LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
        // Find length
        var xhr = new XMLHttpRequest();
        xhr.open('HEAD', url, false);
        xhr.send(null);
        if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
        var datalength = Number(xhr.getResponseHeader("Content-length"));
        var header;
        var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
        var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";

        var chunkSize = 1024*1024; // Chunk size in bytes

        if (!hasByteServing) chunkSize = datalength;

        // Function to get a range from the remote URL.
        var doXHR = (function(from, to) {
          if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
          if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");

          // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, false);
          if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);

          // Some hints to the browser that we want binary data.
          if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
          if (xhr.overrideMimeType) {
            xhr.overrideMimeType('text/plain; charset=x-user-defined');
          }

          xhr.send(null);
          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          if (xhr.response !== undefined) {
            return new Uint8Array(xhr.response || []);
          } else {
            return intArrayFromString(xhr.responseText || '', true);
          }
        });
        var lazyArray = this;
        lazyArray.setDataGetter(function(chunkNum) {
          var start = chunkNum * chunkSize;
          var end = (chunkNum+1) * chunkSize - 1; // including this byte
          end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
          if (typeof(lazyArray.chunks[chunkNum]) === "undefined") {
            lazyArray.chunks[chunkNum] = doXHR(start, end);
          }
          if (typeof(lazyArray.chunks[chunkNum]) === "undefined") throw new Error("doXHR failed!");
          return lazyArray.chunks[chunkNum];
        });

        if (usesGzip || !datalength) {
          // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
          chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
          datalength = this.getter(0).length;
          chunkSize = datalength;
          console.log("LazyFiles on gzip forces download of the whole file when length is accessed");
        }

        this._length = datalength;
        this._chunkSize = chunkSize;
        this.lengthKnown = true;
      };
      if (typeof XMLHttpRequest !== 'undefined') {
        if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
        var lazyArray = new LazyUint8Array();
        Object.defineProperties(lazyArray, {
          length: {
            get: function() {
              if(!this.lengthKnown) {
                this.cacheLength();
              }
              return this._length;
            }
          },
          chunkSize: {
            get: function() {
              if(!this.lengthKnown) {
                this.cacheLength();
              }
              return this._chunkSize;
            }
          }
        });

        var properties = { isDevice: false, contents: lazyArray };
      } else {
        var properties = { isDevice: false, url: url };
      }

      var node = FS.createFile(parent, name, properties, canRead, canWrite);
      // This is a total hack, but I want to get this lazy file code out of the
      // core of MEMFS. If we want to keep this lazy file concept I feel it should
      // be its own thin LAZYFS proxying calls to MEMFS.
      if (properties.contents) {
        node.contents = properties.contents;
      } else if (properties.url) {
        node.contents = null;
        node.url = properties.url;
      }
      // Add a function that defers querying the file size until it is asked the first time.
      Object.defineProperties(node, {
        usedBytes: {
          get: function() { return this.contents.length; }
        }
      });
      // override each stream op with one that tries to force load the lazy file first
      var stream_ops = {};
      var keys = Object.keys(node.stream_ops);
      keys.forEach(function(key) {
        var fn = node.stream_ops[key];
        stream_ops[key] = function forceLoadLazyFile() {
          if (!FS.forceLoadFile(node)) {
            throw new FS.ErrnoError(( cDefine('EIO') ));
          }
          return fn.apply(null, arguments);
        };
      });
      // use a custom read function
      stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
        if (!FS.forceLoadFile(node)) {
          throw new FS.ErrnoError(( cDefine('EIO') ));
        }
        var contents = stream.node.contents;
        if (position >= contents.length)
          return 0;
        var size = Math.min(contents.length - position, length);
        if (contents.slice) { // normal array
          for (var i = 0; i < size; i++) {
            buffer[offset + i] = contents[position + i];
          }
        } else {
          for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
            buffer[offset + i] = contents.get(position + i);
          }
        }
        return size;
      };
      node.stream_ops = stream_ops;
      return node;
    },
    // Preloads a file asynchronously. You can call this before run, for example in
    // preRun. run will be delayed until this file arrives and is set up.
    // If you call it after run(), you may want to pause the main loop until it
    // completes, if so, you can use the onload parameter to be notified when
    // that happens.
    // In addition to normally creating the file, we also asynchronously preload
    // the browser-friendly versions of it: For an image, we preload an Image
    // element and for an audio, and Audio. These are necessary for SDL_Image
    // and _Mixer to find the files in preloadedImages/Audios.
    // You can also call this with a typed array instead of a url. It will then
    // do preloading for the Image/Audio part, as if the typed array were the
    // result of an XHR that you did manually.
    createPreloadedFile: function(parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
      Browser.init(); // XXX perhaps this method should move onto Browser?
      // TODO we should allow people to just pass in a complete filename instead
      // of parent and name being that we just join them anyways
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency('cp ' + fullname); // might have several active requests for the same fullname
      function processData(byteArray) {
        function finish(byteArray) {
          if (preFinish) preFinish();
          if (!dontCreateFile) {
            FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
          }
          if (onload) onload();
          removeRunDependency(dep);
        }
        var handled = false;
        Module['preloadPlugins'].forEach(function(plugin) {
          if (handled) return;
          if (plugin['canHandle'](fullname)) {
            plugin['handle'](byteArray, fullname, finish, function() {
              if (onerror) onerror();
              removeRunDependency(dep);
            });
            handled = true;
          }
        });
        if (!handled) finish(byteArray);
      }
      addRunDependency(dep);
      if (typeof url == 'string') {
        Browser.asyncLoad(url, function(byteArray) {
          processData(byteArray);
        }, onerror);
      } else {
        processData(url);
      }
    },

    //
    // persistence
    //
    indexedDB: function() {
      return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    },

    DB_NAME: function() {
      return 'EM_FS_' + window.location.pathname;
    },
    DB_VERSION: 20,
    DB_STORE_NAME: 'FILE_DATA',

    // asynchronously saves a list of files to an IndexedDB. The DB will be created if not already existing.
    saveFilesToDB: function(paths, onload, onerror) {
      onload = onload || function(){};
      onerror = onerror || function(){};
      var indexedDB = FS.indexedDB();
      try {
        var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
      } catch (e) {
        return onerror(e);
      }
      openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
        console.log('creating db');
        var db = openRequest.result;
        db.createObjectStore(FS.DB_STORE_NAME);
      };
      openRequest.onsuccess = function openRequest_onsuccess() {
        var db = openRequest.result;
        var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
        var files = transaction.objectStore(FS.DB_STORE_NAME);
        var ok = 0, fail = 0, total = paths.length;
        function finish() {
          if (fail == 0) onload(); else onerror();
        }
        paths.forEach(function(path) {
          var putRequest = files.put(FS.analyzePath(path).object.contents, path);
          putRequest.onsuccess = function putRequest_onsuccess() { ok++; if (ok + fail == total) finish() };
          putRequest.onerror = function putRequest_onerror() { fail++; if (ok + fail == total) finish() };
        });
        transaction.onerror = onerror;
      };
      openRequest.onerror = onerror;
    },

    // asynchronously loads a file from IndexedDB.
    loadFilesFromDB: function(paths, onload, onerror) {
      onload = onload || function(){};
      onerror = onerror || function(){};
      var indexedDB = FS.indexedDB();
      try {
        var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
      } catch (e) {
        return onerror(e);
      }
      openRequest.onupgradeneeded = onerror; // no database to load from
      openRequest.onsuccess = function openRequest_onsuccess() {
        var db = openRequest.result;
        try {
          var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
        } catch(e) {
          onerror(e);
          return;
        }
        var files = transaction.objectStore(FS.DB_STORE_NAME);
        var ok = 0, fail = 0, total = paths.length;
        function finish() {
          if (fail == 0) onload(); else onerror();
        }
        paths.forEach(function(path) {
          var getRequest = files.get(path);
          getRequest.onsuccess = function getRequest_onsuccess() {
            if (FS.analyzePath(path).exists) {
              FS.unlink(path);
            }
            FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
            ok++;
            if (ok + fail == total) finish();
          };
          getRequest.onerror = function getRequest_onerror() { fail++; if (ok + fail == total) finish() };
        });
        transaction.onerror = onerror;
      };
      openRequest.onerror = onerror;
    }
  }
});

if (FORCE_FILESYSTEM) {
  DEFAULT_LIBRARY_FUNCS_TO_INCLUDE.push('$FS');
}
// Copyright 2013 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

mergeInto(LibraryManager.library, {
  $MEMFS__deps: ['$FS'],
  $MEMFS: {
    ops_table: null,
    mount: function(mount) {
      return MEMFS.createNode(null, '/', ( cDefine('S_IFDIR') ) | 511 /* 0777 */, 0);
    },
    createNode: function(parent, name, mode, dev) {
      if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
        // no supported
        throw new FS.ErrnoError(( cDefine('EPERM') ));
      }
      if (!MEMFS.ops_table) {
        MEMFS.ops_table = {
          dir: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              lookup: MEMFS.node_ops.lookup,
              mknod: MEMFS.node_ops.mknod,
              rename: MEMFS.node_ops.rename,
              unlink: MEMFS.node_ops.unlink,
              rmdir: MEMFS.node_ops.rmdir,
              readdir: MEMFS.node_ops.readdir,
              symlink: MEMFS.node_ops.symlink
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek
            }
          },
          file: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek,
              read: MEMFS.stream_ops.read,
              write: MEMFS.stream_ops.write,
              allocate: MEMFS.stream_ops.allocate,
              mmap: MEMFS.stream_ops.mmap,
              msync: MEMFS.stream_ops.msync
            }
          },
          link: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              readlink: MEMFS.node_ops.readlink
            },
            stream: {}
          },
          chrdev: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: FS.chrdev_stream_ops
          }
        };
      }
      var node = FS.createNode(parent, name, mode, dev);
      if (FS.isDir(node.mode)) {
        node.node_ops = MEMFS.ops_table.dir.node;
        node.stream_ops = MEMFS.ops_table.dir.stream;
        node.contents = {};
      } else if (FS.isFile(node.mode)) {
        node.node_ops = MEMFS.ops_table.file.node;
        node.stream_ops = MEMFS.ops_table.file.stream;
        node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
        // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
        // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
        // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
        node.contents = null; 
      } else if (FS.isLink(node.mode)) {
        node.node_ops = MEMFS.ops_table.link.node;
        node.stream_ops = MEMFS.ops_table.link.stream;
      } else if (FS.isChrdev(node.mode)) {
        node.node_ops = MEMFS.ops_table.chrdev.node;
        node.stream_ops = MEMFS.ops_table.chrdev.stream;
      }
      node.timestamp = Date.now();
      // add the new node to the parent
      if (parent) {
        parent.contents[name] = node;
      }
      return node;
    },

    // Given a file node, returns its file data converted to a regular JS array. You should treat this as read-only.
    getFileDataAsRegularArray: function(node) {
      if (node.contents && node.contents.subarray) {
        var arr = [];
        for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
        return arr; // Returns a copy of the original data.
      }
      return node.contents; // No-op, the file contents are already in a JS array. Return as-is.
    },

    // Given a file node, returns its file data converted to a typed array.
    getFileDataAsTypedArray: function(node) {
      if (!node.contents) return new Uint8Array;
      if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
      return new Uint8Array(node.contents);
    },

    // Allocates a new backing store for the given node so that it can fit at least newSize amount of bytes.
    // May allocate more, to provide automatic geometric increase and amortized linear performance appending writes.
    // Never shrinks the storage.
    expandFileStorage: function(node, newCapacity) {
      var prevCapacity = node.contents ? node.contents.length : 0;
      if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
      // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
      // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
      // avoid overshooting the allocation cap by a very large margin.
      var CAPACITY_DOUBLING_MAX = 1024 * 1024;
      newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) | 0);
      if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
      var oldContents = node.contents;
      node.contents = new Uint8Array(newCapacity); // Allocate new storage.
      if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
      return;
    },

    // Performs an exact resize of the backing file storage to the given size, if the size is not exactly this, the storage is fully reallocated.
    resizeFileStorage: function(node, newSize) {
      if (node.usedBytes == newSize) return;
      if (newSize == 0) {
        node.contents = null; // Fully decommit when requesting a resize to zero.
        node.usedBytes = 0;
        return;
      }
      if (!node.contents || node.contents.subarray) { // Resize a typed array if that is being used as the backing store.
        var oldContents = node.contents;
        node.contents = new Uint8Array(new ArrayBuffer(newSize)); // Allocate new storage.
        if (oldContents) {
          node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
        }
        node.usedBytes = newSize;
        return;
      }
      // Backing with a JS array.
      if (!node.contents) node.contents = [];
      if (node.contents.length > newSize) node.contents.length = newSize;
      else while (node.contents.length < newSize) node.contents.push(0);
      node.usedBytes = newSize;
    },

    node_ops: {
      getattr: function(node) {
        var attr = {};
        // device numbers reuse inode numbers.
        attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
        attr.ino = node.id;
        attr.mode = node.mode;
        attr.nlink = 1;
        attr.uid = 0;
        attr.gid = 0;
        attr.rdev = node.rdev;
        if (FS.isDir(node.mode)) {
          attr.size = 4096;
        } else if (FS.isFile(node.mode)) {
          attr.size = node.usedBytes;
        } else if (FS.isLink(node.mode)) {
          attr.size = node.link.length;
        } else {
          attr.size = 0;
        }
        attr.atime = new Date(node.timestamp);
        attr.mtime = new Date(node.timestamp);
        attr.ctime = new Date(node.timestamp);
        // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
        //       but this is not required by the standard.
        attr.blksize = 4096;
        attr.blocks = Math.ceil(attr.size / attr.blksize);
        return attr;
      },
      setattr: function(node, attr) {
        if (attr.mode !== undefined) {
          node.mode = attr.mode;
        }
        if (attr.timestamp !== undefined) {
          node.timestamp = attr.timestamp;
        }
        if (attr.size !== undefined) {
          MEMFS.resizeFileStorage(node, attr.size);
        }
      },
      lookup: function(parent, name) {
        throw FS.genericErrors[( cDefine('ENOENT') )];
      },
      mknod: function(parent, name, mode, dev) {
        return MEMFS.createNode(parent, name, mode, dev);
      },
      rename: function(old_node, new_dir, new_name) {
        // if we're overwriting a directory at new_name, make sure it's empty.
        if (FS.isDir(old_node.mode)) {
          var new_node;
          try {
            new_node = FS.lookupNode(new_dir, new_name);
          } catch (e) {
          }
          if (new_node) {
            for (var i in new_node.contents) {
              throw new FS.ErrnoError(( cDefine('ENOTEMPTY') ));
            }
          }
        }
        // do the internal rewiring
        delete old_node.parent.contents[old_node.name];
        old_node.name = new_name;
        new_dir.contents[new_name] = old_node;
        old_node.parent = new_dir;
      },
      unlink: function(parent, name) {
        delete parent.contents[name];
      },
      rmdir: function(parent, name) {
        var node = FS.lookupNode(parent, name);
        for (var i in node.contents) {
          throw new FS.ErrnoError(( cDefine('ENOTEMPTY') ));
        }
        delete parent.contents[name];
      },
      readdir: function(node) {
        var entries = ['.', '..'];
        for (var key in node.contents) {
          if (!node.contents.hasOwnProperty(key)) {
            continue;
          }
          entries.push(key);
        }
        return entries;
      },
      symlink: function(parent, newname, oldpath) {
        var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | ( cDefine('S_IFLNK') ), 0);
        node.link = oldpath;
        return node;
      },
      readlink: function(node) {
        if (!FS.isLink(node.mode)) {
          throw new FS.ErrnoError(( cDefine('EINVAL') ));
        }
        return node.link;
      },
    },
    stream_ops: {
      read: function(stream, buffer, offset, length, position) {
        var contents = stream.node.contents;
        if (position >= stream.node.usedBytes) return 0;
        var size = Math.min(stream.node.usedBytes - position, length);
        if (size > 8 && contents.subarray) { // non-trivial, and typed array
          buffer.set(contents.subarray(position, position + size), offset);
        } else {
          for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
        }
        return size;
      },

      // Writes the byte range (buffer[offset], buffer[offset+length]) to offset 'position' into the file pointed by 'stream'
      // canOwn: A boolean that tells if this function can take ownership of the passed in buffer from the subbuffer portion
      //         that the typed array view 'buffer' points to. The underlying ArrayBuffer can be larger than that, but
      //         canOwn=true will not take ownership of the portion outside the bytes addressed by the view. This means that
      //         with canOwn=true, creating a copy of the bytes is avoided, but the caller shouldn't touch the passed in range
      //         of bytes anymore since their contents now represent file data inside the filesystem.
      write: function(stream, buffer, offset, length, position, canOwn) {

        if (!length) return 0;
        var node = stream.node;
        node.timestamp = Date.now();

        if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
          if (canOwn) {
            node.contents = buffer.subarray(offset, offset + length);
            node.usedBytes = length;
            return length;
          } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
            node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
            node.usedBytes = length;
            return length;
          } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
            node.contents.set(buffer.subarray(offset, offset + length), position);
            return length;
          }
        }

        // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
        MEMFS.expandFileStorage(node, position+length);
        if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position); // Use typed array write if available.
        else {
          for (var i = 0; i < length; i++) {
           node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
          }
        }
        node.usedBytes = Math.max(node.usedBytes, position+length);
        return length;
      },

      llseek: function(stream, offset, whence) {
        var position = offset;
        if (whence === ( cDefine('SEEK_CUR') )) {
          position += stream.position;
        } else if (whence === ( cDefine('SEEK_END') )) {
          if (FS.isFile(stream.node.mode)) {
            position += stream.node.usedBytes;
          }
        }
        if (position < 0) {
          throw new FS.ErrnoError(( cDefine('EINVAL') ));
        }
        return position;
      },
      allocate: function(stream, offset, length) {
        MEMFS.expandFileStorage(stream.node, offset + length);
        stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
      },
      mmap: function(stream, buffer, offset, length, position, prot, flags) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(( cDefine('ENODEV') ));
        }
        var ptr;
        var allocated;
        var contents = stream.node.contents;
        // Only make a new copy when MAP_PRIVATE is specified.
        if ( !(flags & ( cDefine('MAP_PRIVATE') )) &&
              contents.buffer === buffer.buffer ) {
          // We can't emulate MAP_SHARED when the file is not backed by the buffer
          // we're mapping to (e.g. the HEAP buffer).
          allocated = false;
          ptr = contents.byteOffset;
        } else {
          // Try to avoid unnecessary slices.
          if (position > 0 || position + length < stream.node.usedBytes) {
            if (contents.subarray) {
              contents = contents.subarray(position, position + length);
            } else {
              contents = Array.prototype.slice.call(contents, position, position + length);
            }
          }
          allocated = true;
          // malloc() can lead to growing the heap. If targeting the heap, we need to
          // re-acquire the heap buffer object in case growth had occurred.
          var fromHeap = (buffer.buffer == HEAP8.buffer);
          ptr = _malloc(length);
          if (!ptr) {
            throw new FS.ErrnoError(( cDefine('ENOMEM') ));
          }
          (fromHeap ? HEAP8 : buffer).set(contents, ptr);
        }
        return { ptr: ptr, allocated: allocated };
      },
      msync: function(stream, buffer, offset, length, mmapFlags) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(( cDefine('ENODEV') ));
        }
        if (mmapFlags & ( cDefine('MAP_PRIVATE') )) {
          // MAP_PRIVATE calls need not to be synced back to underlying fs
          return 0;
        }

        var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
        // should we check if bytesWritten and length are the same?
        return 0;
      }
    }
  }
});

/*
 * XHR-based backing store for Emscripten FS. Not implemented as an Emscripten
 * FS module because Emscripten FS doesn't support blocking.
 *
 * Copyright (c) 2008-2010, 2020 Gregor Richards
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

var XHRFS = {
    xhrMounts: {},
    failures: {},

    open: function(path, flags, mode) {
        // Try just opening it
        var ret = null, err = null;
        try {
            ret = FS.open(path, flags, mode);
        } catch (ex) {
            err = ex;
        }
        if (ret || !err) return ret;

        // Check if we've already failed this request
        if (path in XHRFS.failures)
            throw err;

        // Check if it falls under one of our XHR mounts
        var root = null;
        for (var mount in XHRFS.xhrMounts) {
            if (path.startsWith(mount)) {
                root = mount;
                break;
            }
        }
        if (!root) throw err;

        // Start an XHR request for it
        var ub = {unblock: true};
        var target = XHRFS.xhrMounts[root] + path.slice(root.length);
        var xhr = new XMLHttpRequest();
        xhr.responseType = "arraybuffer";
        xhr.open("GET", target, true);

        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) return;

            function fail() {
                XHRFS.failures[path] = true;
                ub.unblock();
            }

            if (xhr.status === 404) {
                // Wasn't found, so just fail
                return fail();
            }

            // It was a directory if it ends with /
            var isDirectory = /\/$/.test(xhr.responseURL);

            if (xhr.status !== 200) {
                // Only directories are allowed to fail
                if (!isDirectory)
                    return fail();
            }

            // The data is in, so move it into the real filesystem

            // 1: Make the directory
            var parts = path.split("/");
            var soFar = "/";
            for (var pi = 0; pi < parts.length - (isDirectory?0:1); pi++) {
                var part = parts[pi];
                if (part === "") continue;
                soFar += part;
                try {
                    FS.mkdir2(soFar);
                } catch (ex) {};
                soFar += "/";
            }

            if (!isDirectory) {
                // Then make and fill the file
                var data = new Uint8Array(xhr.response);
                try {
                    FS.writeFile(path, data);
                } catch (err) {
                    return fail();
                }
            }

            // And now we're ready, so unblock
            ub.unblock();
        };

        xhr.send();
        return ub;
    },

    assert: function(pathname) {
        // Try to open it
        var stream;
        try {
            stream = XHRFS.open(pathname, "r");
        } catch (err) {
            return null;
        }

        // If it's blocking, say so
        if (stream.unblock)
            return stream;

        // Otherwise, close it
        if (stream.stream_ops.close)
            stream.stream_ops.close(stream);
        return null;
    },

    mount: function(source, target) {
        if (!/\/$/.test(source))
            source += "/";
        if (!/\/$/.test(target))
            target += "/";
        XHRFS.xhrMounts[target] = source;
    }
};

JSMIPS.XHRFS = XHRFS;
/*
 * Link between Emscripten's FS module and JSMIPS
 *
 * Copyright (c) 2008-2010, 2020 Gregor Richards
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

// First initialize emscripten's FS module
var Module = {};
var PATH = LibraryManager.library.$PATH;
var PATH_FS = LibraryManager.library.$PATH_FS;
var TTY = LibraryManager.library.$TTY;
var FS = LibraryManager.library.$FS;
var MEMFS = LibraryManager.library.$MEMFS;

FS.staticInit();
FS.init();

/**
 * File system. Lifted from Emscripten, so please see Emscripten's FS docs on
 * how to use this.
 * @see {@link https://emscripten.org/docs/api_reference/Filesystem-API.html}
 */
JSMIPS.FS = FS;

// When we create a fresh MIPS sim, it has no FDs and / as cwd
JSMIPS.mipsinit.push(function(mips) {
    // Start with empty fd table
    mips.fds = [];

    // And / as CWD
    mips.cwd = "/";
});

JSMIPS.mipsfork.push(function(mips, nmips) {
    // Copy our fd table, keeping stream and pos, but independently
    var nfds = mips.nfds = [];
    mips.fds.forEach(function(fd) {
        if (fd === null) {
            nfds.push(null);
            return;
        }

        var nfd = {
            stream: fd.stream,
            pos: fd.pos
        };
        nfds.push(nfd);
    });
});

// Convert emscripten FS errors to errnos
function fsErr(err) {
    if (typeof err === "object" && "errno" in err)
        return -err.errno;
    return -JSMIPS.ENOTSUP;
}

// When we fork, we need to remember all the fds
JSMIPS.mipsfork.push(function(mips, nmips) {
    nmips.fds = [];
    nmips.cwd = mips.cwd;

    while (nmips.fds.length < mips.fds.length)
        nmips.fds.push(null);

    for (var fd = 0; fd < mips.fds.length; fd++) {
        if (!mips.fds[fd]) continue;
        var nfd = mips.dup(fd);
        nmips.fds[fd] = mips.fds[nfd];
        mips.fds[nfd] = null;
    }
});

// And when we stop, we need to close them all
JSMIPS.mipsstop.push(function(mips) {
    for (var fd = 0; fd < mips.fds.length; fd++) {
        if (!mips.fds[fd]) continue;
        sys_close(mips, fd);
    }
});

/**
 * We avoid Emscripten's cwd, because each MIPS sim has its own, so use this to
 * get absolute paths
 */
function absolute(mips, path) {
    if (path.length === 0)
        return mips.cwd;

    try {
        path = FS.lookupPath(path).path;
    } catch (ex) {}
    path = PATH.normalize(mips.cwd + path);

    return path;
}


// syscalls

/**
 * execve. Usually to be run by the system call, but also useful for initial
 * setup of a fresh sim.
 *
 * @param {string} filename     Path to the ELF file to load
 * @param {Array.<string>=} args Arguments
 * @param {Array.<string>=} envs Environment
 * @return {int}                0 for success, a negative errno if an error occurred
 */
JSMIPS.MIPS.prototype.execve = function(filename, args, envs) {
    if (typeof args === "undefined") args = [filename];
    if (typeof envs === "undefined") envs = [];

    // The only AUX we currently support is PAGESZ
    var AT_PAGESZ = 6;

    function elfRead(filename) {
        var file;

        // Assert that it exists, in case of xhr
        var ub = XHRFS.assert(filename);
        if (ub)
            return ub;

        // Read the file (FIXME: Won't work if blocking is still possible)
        try {
            file = FS.readFile(filename, {encoding: "binary"});
        } catch (err) {
            return fsErr(err);
        }

        // Convert to 32-bit for loadELF
        if (file.length % 4 !== 0) {
            var file4 = new Uint8Array(file.length + 4 - file.length%4);
            file4.set(file);
            file = file4;
        }
        var file32 = new Uint32Array(file.length / 4);
        var filedv = new DataView(file.buffer);
        for (var i = 0; i < file32.length; i++)
            file32[i] = filedv.getUint32(i*4);
        file = file32;

        return file;
    }

    var file;
    if (typeof filename === "string") {
        file = elfRead(filename);
        if (!file.buffer)
            return file;

    } else {
        // You're allowed to include the ELF directly
        file = filename;

    }

    // Close any cloexec fds
    for (var fd = 0; fd < this.fds.length; fd++) {
        if (this.fds[fd] && this.fds[fd].cloexec)
            sys_close(this, fd);
    }

    // Load the ELF
    var aux = [[AT_PAGESZ, 4096]];
    var opts = {aux: aux};
    this.loadELF(file, opts);

    // Perhaps load the interpreter
    if (opts.interp) {
        var interp = elfRead("/usr/lib/libc.so" /*opts.interp*/);
        if (!interp.buffer)
            return interp;
        this.loadELF(interp, {keepMem: true});
    }

    // Load out args and envs
    var topaddr = 0xFFFFFFFC;
    var i;
    this.mem.set(topaddr, 0);
    for (i = 0; i < args.length; i++) {
        var arg = args[i];
        topaddr -= arg.length + 1;
        this.mem.setstr(topaddr, arg);
        args[i] = topaddr;
    }
    for (i = 0; i < envs.length; i++) {
        var env = envs[i];
        topaddr -= env.length + 1;
        this.mem.setstr(topaddr, env);
        envs[i] = topaddr;
    }

    // Put the aux on the stack
    topaddr = this.regs[29] - 4;
    this.mem.set(topaddr, 0);
    for (var ai = 0; ai < aux.length; ai++) {
        var auxp = aux[ai];
        topaddr -= 8;
        this.mem.set(topaddr, auxp[0]);
        this.mem.set(topaddr+4, auxp[1]);
    }

    // And put the references to the arg and env
    topaddr -= 4;
    this.mem.set(topaddr, 0);
    for (i = envs.length - 1; i >= 0; i--) {
        topaddr -= 4;
        this.mem.set(topaddr, envs[i]);
    }
    topaddr -= 4;
    this.mem.set(topaddr, 0);
    for (i = args.length - 1; i >= 0; i--) {
        topaddr -= 4;
        this.mem.set(topaddr, args[i]);
    }
    topaddr -= 4;
    this.mem.set(topaddr, args.length);
    this.regs[29] = topaddr;

    return 0;
}

// execve(4011)
function sys_execve(mips, filename, argv, envp) {
    // Load out the arguments
    filename = mips.mem.getstr(filename);
    var args = [], envs = [];

    for (;; argv += 4) {
        var arg = mips.mem.get(argv);
        if (arg === 0)
            break;
        else
            args.push(mips.mem.getstr(arg));
    }
    for (;; envp += 4) {
        var env = mips.mem.get(envp);
        if (env === 0)
            break;
        else
            envs.push(mips.mem.getstr(env));
    }

    return mips.execve(filename, args, envs);
}
JSMIPS.syscalls[JSMIPS.NR_execve] = sys_execve;

// read(4003)
function sys_read(mips, fd, buf, count) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    fd = mips.fds[fd];
    var stream = fd.stream;

    // Read into an internal buffer
    var rbuf = new Uint8Array(count);
    var ret = stream.stream_ops.read(stream, rbuf, 0, count, fd.position);
    if (typeof ret === "object") {
        // Block (FIXME: nonblocking)
        return ret;
    }
    fd.position += ret;

    // Then convert to JSMIPS memory
    for (var i = 0; i < ret; i++)
        mips.mem.setb(buf + i, rbuf[i]);

    return ret;
}
JSMIPS.syscalls[JSMIPS.NR_read] = sys_read;

// write(4004)
function sys_write(mips, fd, buf, count) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    fd = mips.fds[fd];
    var stream = fd.stream;

    // Extract the buffer
    var wbuf = new Uint8Array(count);
    for (var i = 0; i < count; i++)
        wbuf[i] = mips.mem.getb(buf + i);

    // Perform the write
    var ret = stream.stream_ops.write(stream, wbuf, 0, count, fd.position, true);
    fd.position += ret;
    return ret;
}
JSMIPS.syscalls[JSMIPS.NR_write] = sys_write;

/**
 * open. Almost always to be used by the system call, but sometimes useful for
 * initial setup, particularly of stdin/stdout/stderr.
 *
 * @param {string} pathname     Path to open
 * @param {int} flags           Open flags
 * @param {int} mode            Mode with which to create the file, if applicable
 * @return {int}                A positive file descriptor on success, negative errno on error
 */
JSMIPS.MIPS.prototype.open = function(pathname, flags, mode) {
    pathname = absolute(this, pathname);

    var ps = FS.flagsToPermissionString(flags).replace("rw", "w+").replace("ww", "w");
    var stream;

    // Open via XHRFS to auto-download
    try {
        stream = XHRFS.open(pathname, ps, mode);
    } catch (err) {
        return fsErr(err);
    }
    if (stream.unblock) {
        // Blocking request
        return stream;
    }

    // Keep track of our counter so we can close it when we're done
    stream.jsmipsCt = 1;

    // Find an open fd
    var ret = -1;
    for (var i = 0; i < this.fds.length; i++) {
        if (!this.fds[i]) {
            ret = i;
            break;
        }
    }

    // Or choose the next one in line
    if (ret < 0) {
        ret = this.fds.length;
        this.fds.push(null);
    }

    this.fds[ret] = {stream: stream, position: stream.position};

    if (flags & JSMIPS.O_DIRECTORY) {
        // Opening a directory
        return opendir(this, ret, stream);
    }

    return ret;
}

/**
 * opendir. Really just part of open, don't call this directly. Adds dirContent
 * to the stream.
 *
 * @private
 * @param {JSMIPS.MIPS} mips    The machine
 * @param {int} fd              File descriptor
 * @param {Object} stream       Emscripten FD stream
 */
function opendir(mips, fd, stream) {
    var path = stream.path;
    if (!stream.node.isFolder)
        return -JSMIPS.ENOTDIR;

    // Just preload into a buffer
    stream.dirContent = [];
    FS.readdir(path).forEach(function(name) {
        var j = FS.stat(path + "/" + name);
        stream.dirContent.push({
            ino: j.ino,
            type: j.mode,
            name: name
        });
    });
    return fd;
}

// open(4005)
function sys_open(mips, pathname, flags, mode) {
    return mips.open(mips.mem.getstr(pathname), flags, mode);
}
JSMIPS.syscalls[JSMIPS.NR_open] = sys_open;

// close(4006)
function sys_close(mips, fd) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;

    var stream = mips.fds[fd].stream;
    if (--stream.jsmipsCt <= 0 && stream.stream_ops.close)
        stream.stream_ops.close(stream);

    mips.fds[fd] = null;
    return 0;
}
JSMIPS.syscalls[JSMIPS.NR_close] = sys_close;

// unlink(4010)
function sys_unlink(mips, pathname) {
    pathname = absolute(mips, mips.mem.getstr(pathname));

    try {
        FS.unlink(pathname);
    } catch (err) {
        return fsErr(err);
    }

    return 0;
}
JSMIPS.syscalls[JSMIPS.NR_unlink] = sys_unlink;

// access(4033)
function sys_access(mips, pathname, mode) {
    pathname = absolute(mips, mips.mem.getstr(pathname));

    var ub = XHRFS.assert(pathname);
    if (ub)
        return ub;

    // FIXME: If it exists, it's fine?
    var stream;
    try {
        stream = FS.open(pathname, "r");
    } catch (err) {
        return fsErr(err);
    }

    if (stream.stream_ops.close)
        stream.stream_ops.close(stream);

    return 0;
}
JSMIPS.syscalls[JSMIPS.NR_access] = sys_access;

/**
 * Brilliantly, Emscripten mkdir will actually blank out a directory if you
 * mkdir over an existing directory, so we have to do checking ourselves.
 */
FS.mkdir2 = function(pathname, mode) {
    try {
        FS.lookupPath(pathname);
        return -JSMIPS.EEXIST;
    } catch (err) {}

    try {
        FS.mkdir(pathname, mode);
    } catch (err) {
        return fsErr(err);
    }

    return 0;
}

// mkdir(4039)
function sys_mkdir(mips, pathname, mode)
{
    pathname = absolute(mips, mips.mem.getstr(pathname));
    return FS.mkdir2(pathname, mode);
}
JSMIPS.syscalls[JSMIPS.NR_mkdir] = sys_mkdir;

/**
 * dup
 * @private
 */
JSMIPS.MIPS.prototype.dup = function(fd, min) {
    if (!this.fds[fd])
        return -JSMIPS.EBADF;
    fd = this.fds[fd];

    // Find a free fd
    var nfd = min||0;
    for (nfd = min; nfd < this.fds.length; nfd++) {
        if (!this.fds[nfd])
            break;
    }
    while (nfd >= this.fds.length)
        this.fds.push(null);

    // Set it up
    this.fds[nfd] = {
        stream: fd.stream,
        position: fd.position
    };

    // Increment its counter
    fd.stream.jsmipsCt++;

    return nfd;
}

// dup(4041)
function sys_dup(mips, fd) {
    return mips.dup(fd);
}
JSMIPS.syscalls[JSMIPS.NR_dup] = sys_dup;

// pipe(4042)
function sys_pipe(mips) {
    // find two open fd slots
    var pin, pout, i;
    for (i = 0; i < mips.fds.length; i++) {
        if (!mips.fds[i])
            break;
    }
    pin = i;
    for (i++; i < mips.fds.length; i++) {
        if (!mips.fds[i])
            break;
    }
    pout = i;

    // Make sure the slots actually exist
    while (pout >= mips.fds.length)
        mips.fds.push(null);

    // And open them
    var pbuffer = [];
    var ub = {};

    mips.fds[pin] = {
        stream: {
            stream_ops: {
                read: function(stream, buffer, offset, length, position) {
                    if (pbuffer.length === 0)
                        return ub;

                    if (length > pbuffer.length)
                        length = pbuffer.length;

                    for (var i = 0; i < length; i++) {
                        var x = pbuffer.shift();
                        if (x === -1) { // EOF
                            length = i;
                            if (i !== 0)
                                pbuffer.unshift(-1);
                            break;
                        }
                        buffer[offset+i] = x;
                    }

                    return length;
                }
            },
            jsmipsCt: 1
        },
        position: 0
    };

    mips.fds[pout] = {
        stream: {
            stream_ops: {
                write: function(stream, buffer, offset, length, position, canOwn) {
                    for (var i = 0; i < length; i++)
                        pbuffer.push(buffer[offset+i]);

                    if (ub.unblock) {
                        var oub = ub;
                        ub = {};
                        oub.unblock();
                    }

                    return length;
                },

                close: function() {
                    pbuffer.push(-1);
                    if (ub.unblock) {
                        var oub = ub;
                        ub = {};
                        oub.unblock();
                    }
                }
            },

            jsmipsCt: 1
        },
        position: 0
    };

    // Pipe uses a different style to write things back out
    mips.regs[3] = pout;
    return pin;
}
JSMIPS.syscalls[JSMIPS.NR_pipe] = sys_pipe;

// dup2(4063)
function sys_dup2(mips, fd1, fd2) {
    // Dup it first
    var ret = mips.dup(fd1);
    if (ret < 0) return ret;

    // Put it where it belongs
    if (ret !== fd2) {
        if (mips.fds[fd2])
            sys_close(mips, fd2);
        while (mips.fds.length <= fd2)
            mips.fds.push(null);
        mips.fds[fd2] = mips.fds[ret];
        mips.fds[ret] = null;
    }
    return fd2;
}
JSMIPS.syscalls[JSMIPS.NR_dup2] = sys_dup2;

// symlink(4083)
function sys_symlink(mips, target, linkpath) {
    target = mips.mem.getstr(target);
    linkpath = absolute(mips, mips.mem.getstr(linkpath));

    try {
        FS.symlink(target, linkpath);
    } catch (err) {
        return fsErr(err);
    }

    return 0;
}
JSMIPS.syscalls[JSMIPS.NR_symlink] = sys_symlink;

// readlink(4085)
function sys_readlink(mips, pathname, buf, bufsiz) {
    pathname = absolute(mips, mips.mem.getstr(pathname));

    var target;
    try {
        target = FS.readlink(pathname);
    } catch (err) {
        return fsErr(err);
    }

    if (target.length > bufsiz) target = target.slice(0, bufsiz);
    mips.mem.setstr(buf, target);

    return target.length;
}
JSMIPS.syscalls[JSMIPS.NR_readlink] = sys_readlink;

// llseek(4140)
function sys_llseek(mips, fd, offset_high, offset_low) {
    var result = mips.regs[7];
    var whence = mips.regs[8];

    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    fd = mips.fds[fd];

    var newoff;
    try {
        newoff = FD.llseek(fd.stream, (offset_high<<32)|offset_low, whence);
    } catch (err) {
        return fsErr(err);
    }

    mips.mem.setd(result, newoff);
    return 0;
}
JSMIPS.syscalls[JSMIPS.NR_llseek] = sys_llseek;

// poll(4188)
function sys_poll(mips, fds, nfds, timeout) {
    // Quick hack workaround
    if (nfds === 1) {
        var events = mips.mem.geth(fds + 4);
        mips.mem.seth(fds + 6, events&0x5);
        return 1;
    }

    return -JSMIPS.ENOTSUP;
}
JSMIPS.syscalls[JSMIPS.NR_poll] = sys_poll;

// getcwd(4203)
function sys_getcwd(mips, buf, size) {
    if (mips.cwd.length + 1 > size)
        return -JSMIPS.ERANGE;
    mips.mem.setstr(buf, mips.cwd);
    return buf;
}
JSMIPS.syscalls[JSMIPS.NR_getcwd] = sys_getcwd;

// mmap2(4210)
function sys_mmap2_fs(mips, addr, length, prot) {
    // This overrides the builtin mmap, which only supports anonymous maps
    var fd = mips.regs[8]>>0;
    if (fd < 0)
        return JSMIPS.sys_mmap2(mips, addr, length, prot);

    var offset = mips.regs[9] << 12;

    /* OK, they are actually asking to map a file. We don't *actually* support
     * mapping files, just copying files into mapped location */
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    var stream = mips.fds[fd].stream;

    // Read into an internal buffer
    var rbuf = new Uint8Array(length);
    var rd = stream.stream_ops.read(stream, rbuf, 0, length, offset);
    if (typeof rd === "object") {
        // Block
        return rd;
    }

    // Get the memory
    mips.regs[8] = -1;
    var ret = JSMIPS.sys_mmap2(mips, addr, length, prot);
    mips.regs[8] = fd;
    if (ret < 0)
        return ret;

    // Then convert to JSMIPS memory
    for (var i = 0; i < rd; i++)
        mips.mem.setb(ret + i, rbuf[i]);

    return ret;
}
JSMIPS.syscalls[JSMIPS.NR_mmap2] = sys_mmap2_fs;

/**
 * Generic frontend for stat and lstat
 * @private
 */
function multistat(mips, mode, pathname, statbuf) {
    if (typeof pathname === "number")
        pathname = absolute(mips, mips.mem.getstr(pathname));

    // Assert its existence
    var ub = XHRFS.assert(pathname);
    if (ub) return ub;

    var j;
    try {
        j = FS[mode](pathname);
    } catch (err) {
        return fsErr(err);
    }

    /*
     * struct stat {
     * 	dev_t st_dev;               int64  0
     * 	long __st_padding1[2];             8
     * 	ino_t st_ino;               int64  16
     * 	mode_t st_mode;             uint32 24
     * 	nlink_t st_nlink;           uint32 28
     * 	uid_t st_uid;               uint32 32
     * 	gid_t st_gid;               uint32 36
     * 	dev_t st_rdev;              int64  40
     * 	long __st_padding2[2];             48
     * 	off_t st_size;              int64  56
     * 	struct timespec st_atim;    int64  64
     * 	struct timespec st_mtim;    int64  72
     * 	struct timespec st_ctim;    int64  80
     * 	blksize_t st_blksize;       int32  88
     * 	long __st_padding3;                92
     * 	blkcnt_t st_blocks;         int64  96
     *  long __st_padding4[14];
     * };
     */

    function s(o, v) {
        mips.mem.set(statbuf + o, v);
    }
    function sd(o, v) {
        mips.mem.setd(statbuf + o, v);
    }
    sd(0, j.dev);
    sd(16, j.ino);
    s(24, j.mode);
    s(28, j.nlink);
    s(32, 0); // uid
    s(36, 0); // gid
    s(40, j.rdev);
    sd(56, j.size);
    var atime = j.atime.getTime()/1000;
    s(64, atime);
    s(68, (atime*1000000000)%1000000000);
    var mtime = j.mtime.getTime()/1000;
    s(72, mtime);
    s(76, (mtime*1000000000)%1000000000);
    var ctime = j.ctime.getTime()/1000;
    s(80, ctime);
    s(84, (ctime*1000000000)%1000000000);
    s(88, j.blksize);
    sd(96, j.blocks);

    return 0;
}

// stat64(4213)
function sys_stat64(mips, pathname, statbuf) {
    return multistat(mips, "stat", pathname, statbuf);
}
JSMIPS.syscalls[JSMIPS.NR_stat64] = sys_stat64;

// lstat64(4214)
function sys_lstat64(mips, pathname, statbuf) {
    return multistat(mips, "lstat", pathname, statbuf);
}
JSMIPS.syscalls[JSMIPS.NR_lstat64] = sys_lstat64;

// fstat64(4215)
function sys_fstat64(mips, fd, statbuf) {
    // FIXME: Is it possible to do this better with Emscripten?
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    return multistat(mips, "stat", mips.fds[fd].stream.path, statbuf);
}
JSMIPS.syscalls[JSMIPS.NR_fstat64] = sys_fstat64;

// getdents64(4219)
function sys_getdents64(mips, fd, dirp, count) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    fd = mips.fds[fd];

    // Make sure it's a directory
    if (!fd.stream.dirContent)
        return -JSMIPS.ENOTDIR;

    /*
     * struct linux_dirent64 {
     *  ino64_t        d_ino;    / * 64-bit inode number * /
     *  off64_t        d_off;    / * 64-bit offset to next structure * /
     *  unsigned short d_reclen; / * Size of this dirent * /
     *  unsigned char  d_type;   / * File type * /
     *  char           d_name[]; / * Filename (null-terminated) * /
     * }
     */

    if (fd.position >= fd.stream.dirContent.length) {
        // Nothing left to read!
        return 0;
    }

    // Put out as many records as fit
    var dirStart = dirp;
    var dirEnd = dirp + count;
    var ri;
    for (ri = fd.position; ri < fd.stream.dirContent.length && dirp < dirEnd; ri++) {
        var ent = fd.stream.dirContent[ri];

        // make room
        var deLen = (19 /*d_ino...d_type*/ + ent.name.length /*d_name*/ + 4 /*null term + padding*/) >>> 2 << 2;
        var deEnd = dirp + deLen;
        if (deEnd > dirEnd)
            break;

        // fill it in
        mips.mem.setd(dirp,         ent.ino);
        mips.mem.setd(dirp+8,       deLen); // FIXME: This can't be right...
        mips.mem.seth(dirp+16,      deLen);
        mips.mem.setb(dirp+18,      1); // FIXME: Map the type
        mips.mem.setstr(dirp+19,    ent.name);

        // and step
        dirp += deLen;
    }
    fd.position = ri;

    if (dirp === dirStart) {
        // I couldn't even fit one result in your lousy buffer!
        return -JSMIPS.EINVAL;
    }

    return dirp - dirStart;
}
JSMIPS.syscalls[JSMIPS.NR_getdents64] = sys_getdents64;

// sendfile64(4237)
function sys_sendfile64(mips, out_fd, in_fd, offset) {
    var count = mips.regs[7];

    if (!mips.fds[out_fd])
        return -JSMIPS.EBADF;
    out_fd = mips.fds[out_fd];
    if (!mips.fds[in_fd])
        return -JSMIPS.EBADF;
    in_fd = mips.fds[in_fd];

    var position = in_fd.position;
    if (offset)
        position = mips.mem.getd(offset);

    // Read it in
    var buf = new Uint8Array(count);
    var rd;
    try {
        rd = in_fd.stream.stream_ops.read(in_fd.stream, buf, 0, count, position);
    } catch (err) {
        return fsErr(err);
    }
    if (typeof rd === "object")
        return rd;
    position += rd;

    // And write it out
    var wr;
    try {
        wr = out_fd.stream.stream_ops.write(out_fd.stream, buf, 0, rd, out_fd.position, true);
    } catch (err) {
        return fsErr(err);
    }
    if (typeof wr === "object")
        return wr;
    out_fd.position += wr;

    // Update offset as appropriate
    if (offset) {
        mips.mem.setd(offset, position);
    } else {
        in_fd.position = position;
    }

    return wr;
}
JSMIPS.syscalls[JSMIPS.NR_sendfile64] = sys_sendfile64;

// fcntls

JSMIPS.fcntls[JSMIPS.F_SETFD] = function(mips, fd, cmd, a) {
    // Sure, have whatever flags you want!
    return 0;
};

JSMIPS.fcntls[JSMIPS.F_DUPFD_CLOEXEC] = function(mips, fd, cmd, min) {
    // FIXME: No support for CLOEXEC
    var ret = mips.dup(fd, min);
    mips.fds[ret].cloexec = true;
    return ret;
};

return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
