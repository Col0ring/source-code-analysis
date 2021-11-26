import {
  Store,
  createStore,
  Reducer,
  Action,
  StoreEnhancer,
  StoreCreator,
  StoreEnhancerStoreCreator,
  Unsubscribe,
  Observer,
  PreloadedState,
  CombinedState,
} from 'redux'
// @ts-ignore
import $$observable from '../src/utils/symbol-observable'

type BrandedString = string & { _brand: 'type' }
const brandedString = 'a string' as BrandedString

type State = {
  a: 'a'
  b: {
    c: 'c'
    d: 'd'
  }
  c: BrandedString
}

interface DerivedAction extends Action {
  type: 'a'
  b: 'b'
}

const reducer: Reducer<State> = (
  state: State | undefined = {
    a: 'a',
    b: {
      c: 'c',
      d: 'd',
    },
    c: brandedString,
  },
  action: Action
): State => {
  return state
}

const reducerWithAction: Reducer<State, DerivedAction> = (
  state: State | undefined = {
    a: 'a',
    b: {
      c: 'c',
      d: 'd',
    },
    c: brandedString,
  },
  action: DerivedAction
): State => {
  return state
}

const funcWithStore = (store: Store<State, DerivedAction>) => {}

/* createStore */

const store: Store<State> = createStore(reducer)

const storeWithPreloadedState: Store<State> = createStore(reducer, {
  a: 'a',
  b: { c: 'c', d: 'd' },
  c: brandedString,
})
// typings:expect-error
const storeWithBadPreloadedState: Store<State> = createStore(reducer, {
  b: { c: 'c' },
  c: brandedString,
})

const storeWithActionReducer = createStore(reducerWithAction)
const storeWithActionReducerAndPreloadedState = createStore(reducerWithAction, {
  a: 'a',
  b: { c: 'c', d: 'd' },
  c: brandedString,
})
funcWithStore(storeWithActionReducer)
funcWithStore(storeWithActionReducerAndPreloadedState)

// typings:expect-error
const storeWithActionReducerAndBadPreloadedState = createStore(
  reducerWithAction,
  {
    b: { c: 'c' },
    c: brandedString,
  }
)

const enhancer: StoreEnhancer = (next) => next

const storeWithSpecificEnhancer: Store<State> = createStore(reducer, enhancer)

const storeWithPreloadedStateAndEnhancer: Store<State> = createStore(
  reducer,
  {
    a: 'a',
    b: { c: 'c', d: 'd' },
    c: brandedString,
  },
  enhancer
)

// typings:expect-error
const storeWithBadPreloadedStateAndEnhancer: Store<State> = createStore(
  reducer,
  {
    b: { c: 'c' },
  },
  enhancer
)

/* dispatch */

store.dispatch({
  type: 'ADD_TODO',
  text: 'test',
})

/* getState */

const state: State = store.getState()

/* subscribe / unsubscribe */

const unsubscribe: Unsubscribe = store.subscribe(() => {
  console.log('Current state:', store.getState())
})

unsubscribe()

/* replaceReducer */

const newReducer: Reducer<State> = reducer

store.replaceReducer(newReducer)

/* observable */

let observable = store[Symbol.observable]()
observable = observable[Symbol.observable]()
const observer: Observer<State> = {
  next(state: State) {
    console.log('current state:', state)
  },
}
const unsubscribeFromObservable = observable.subscribe(observer).unsubscribe
unsubscribeFromObservable()

// some type tests for PreloadedState
const ANY: any = {}
const notNever: PreloadedState<{ key: unknown }>['key'] = ANY as unknown
// typings:expect-error
const isNever: PreloadedState<{ key: never }>['key'] = ANY as unknown
const is5: 5 = ANY as PreloadedState<{ key: 5 }>['key']
// typings:expect-error
const isNot5: 5 = ANY as PreloadedState<{ key: 6 }>['key']
const isNumber: number = ANY as PreloadedState<{ key: number }>['key']
const isString: string = ANY as PreloadedState<{ key: string }>['key']
const isNested: { nested: string } = ANY as PreloadedState<{
  key: { nested: string }
}>['key']
const isNestedOptional: { nested?: string } = ANY as PreloadedState<{
  key: CombinedState<{ nested: string }>
}>['key']
// typings:expect-error
const isNestedReallyOptional: { nested: string } = ANY as PreloadedState<{
  key: CombinedState<{ nested: string }>
}>['key']
