Mopidy ES6
======

Mopidy library targeting ES2015 with no dependencies.

The library was made as I had some conflicts with the dependencies of mopidy.js, which this library is heavily based off of.

## Installation

`npm install mopidy-es6`

## Using the library

```js
import Mopidy from 'mopidy-es6';

var mopidy = new Mopidy('ws://localhost:6680/mopidy/ws/');
```
