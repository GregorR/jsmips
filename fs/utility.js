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
