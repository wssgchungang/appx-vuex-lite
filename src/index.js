let actionsCache = {};
import EventEmitter from './emitter';
// const EventEmitter = require('./emitter').default;
const emitter = new EventEmitter();

// for dev tools in future
function logger() {
  return console.info.apply(this, arguments);
}

function isObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]';
};

function isString(str) {
  return Object.prototype.toString.call(str) === '[object String]';
};

export function setIn(state, array, value) {
  const setRecursively = function (state, array, value, index) {
    let clone = {};
    let prop = array[index];
    let newState;
    if (array.length > index) {
      // get cloned object
      if (Array.isArray(state)) {
        clone = state.slice(0);
      } else {
        clone = Object.assign({}, state);
      }
      // not exists, make new {}
      newState = state[prop] !== undefined ? state[prop] : {};
      clone[prop] = setRecursively(newState, array, value, index + 1);
      return clone;
    }
    return value;
  };

  return setRecursively(state, array, value, 0);
}

const mutationCache = {
  default: d => d,
  setIn: (d, s) => setIn(s, d.path, d.value)
};

function createHelpers(actions) {
//   const that = this;
  return {
    commit(type, payload, obj) {
      if (!type) {
        throw new Error(`not found ${type} action`);
      }
      if (isObject(type)) {
        payload = type;
        type = 'update';
      }
      let option = {
        mutationFunc: 'default',
        storageName: '',
        ...obj
      }
      if (option.storageName && option.storageName != '') {
        for (let key in payload) {
          my.setStorage({
            key: `${option.storageName}${key}`,
            data: payload[key]
          })
        }
      }
      logger('%c prev state', 'color: #9E9E9E; font-weight: bold', this.data);
      logger(`%c mutation: ${type}`, 'color: #03A9F4; font-weight: bold', payload, new Date().getTime());
      const finalMutation = mutationCache[option.mutationFunc] ? mutationCache[option.mutationFunc](payload, this.data) : option.mutationFunc(payload, this.data);
      this.setData(finalMutation);
      emitter.emitEvent('updateState', this.data);
      logger('%c next state', 'color: #4CAF50; font-weight: bold', this.data);
      // commit 的结果是一个同步行为
      return this.data;
    },
    dispatch(type, payload) {
        console.log('tt', this);
      const actionCache = Object.assign({}, actions, this);
      const actionFunc = actionCache[type];
      if (!actionFunc) {
        throw new Error('not found an action');
      }
      const self = this;
      logger(`%c action ${type} dispatching`, 'color: #9E9E9E; font-weight: bold', payload);
      const res = actionFunc.call(self, {
        commit: this.commit.bind(self),
        dispatch: this.dispatch.bind(self),
        put: function (type, ...args) {
          const func = actionCache[type];
          if (!func) {
            throw new Error(`not found ${type} action`);
          }
          if (func) {
            func.apply(self, args);
          }
        },
        get state() {
          return self.data;
        }
      }, payload);
      // 保证结果为一个 promise
      if (res instanceof Promise) {
        return res;
      }
      return Promise.resolve(res);
    }
  };
}

export function storeHelper(actions, config) {
  return {
    ...config,
    ...createHelpers.call(this, actions),
  };
}

export function connect(options) {
  const { mapStateToProps } = options;
  return function (config) {
    const _didMount = config.didMount;
    return {
      ...config,
      methods: {
        ...config.methods,
        ...createHelpers.call(this, actionsCache)
      },
      didMount() {
        if (mapStateToProps) {
          emitter.addListener('updateState', (data = {}) => {
            if (Array.isArray(mapStateToProps)) {
              const outterState = mapStateToProps.reduce((p, v) => {
                p[v] = data[v];
                return p;
              }, {});
              this.setData(outterState);
            } else {
              const outterState = Object.keys(mapStateToProps).reduce((p, v) => {
                if (isString(mapStateToProps[v])) {
                  p[v] = data[mapStateToProps[v]];
                } else {
                  p[v] = mapStateToProps[v](data, config);
                }
                return p;
              }, {});
              this.setData(outterState);
            }
          });
        }
        if (typeof _didMount === 'function') {
          _didMount.call(this);
        }
      }
    };
  };
}

export default function Store(store, options) {
  const actions = store.actions || store;
  Object.assign(actionsCache, actions);
  const state = store.state || {};
  const name = store.name || '';
  return function(config) {
    const { data = {} } = config;
    Object.assign(data, state);
    const originOnLoad = config.onLoad;
    // sync state for data
    config.onLoad = function() {
      if (name != '' && JSON.stringify(state) != '{}') {
        for (let key in state) {
          if (!state[key] || JSON.stringify(state[key]) == '[]' || JSON.stringify(state[key]) == '{}' || name) {
            let res = my.getStorageSync({ key: `${name}${key}` });
            if (res.data) {
              state[key] = res.data;
            }
          }
        }
      }
      Object.assign(data, state);
      Object.defineProperty(this, 'state', {
        get: function() { return this.data; }
      });
      if (originOnLoad) {
        originOnLoad.apply(this, arguments);
      }
    };
    return storeHelper(actions, config);
  };
}
