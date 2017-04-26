import { createApiObject } from '../src/mopidy';

test('api is assigned correctly', () => {
  var api = {
    'core.playback.pause': { description: '', params: [] as any[] },
    'playback.seek': {
      description: '',
      params: [
        { name: 'time', default: null }
      ]
    },
    'foo_bar': { description: '', params: [] as any[] }
  }

  var apiObject = createApiObject(api, (method: string, params?: any) => params ? { method, params } : { method });

  expect(apiObject.playback.pause()).toEqual({ method: 'core.playback.pause' });
  expect(apiObject.playback.seek(55)).toEqual({ method: 'playback.seek', params: { time: 55 } });
  expect(apiObject.fooBar()).toEqual({ method: 'foo_bar' });
});

test('method with multiple parameters is assigned correctly', () => {
  var api = {
    'test.method': {
      description: '',
      params: [
        { name: 'first', default: null },
        { name: 'second', default: null }
      ]
    }
  }

  var apiObject = createApiObject(api, (method: string, params?: any) => params ? { method, params } : { method });

  expect(apiObject.test.method("one", "two")).toEqual({ method: 'test.method', params: { first: "one", second: "two" } });
});