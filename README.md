Mopidy
======

Mopidy library targeting ES2015 with no dependencies.

The library was made for better integration of Typescript typings, and I had some issues with the official library dependencies from React Native.

## Installation

`npm install mopidy-es6`

## Using the library

```js
import Mopidy from 'mopidy';

var mopidy = new Mopidy('ws://localhost:6680/mopidy/ws/');
```