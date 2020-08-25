import { graphql, subscribe } from 'graphql';
import { parse } from 'graphql/language';
import { buildSchema } from 'graphql/utilities';

// From https://graphql.org/learn/schema/#scalar-types
const BUILT_IN_SCALARS = ['Int', 'Float', 'String', 'Boolean', 'ID'];

function makeExecutableSchema({ typeDefs, resolvers: typeToFieldResolversMap }) {
  const schema = buildSchema(typeDefs); // the returned schema has only default resolvers
  const typesInSchema = Object.keys(schema.getTypeMap()).filter(
    k => !k.startsWith('__') && !BUILT_IN_SCALARS.includes(k)
  );

  // overwrite default resolvers with ours where provided
  typesInSchema.forEach(type => {
    const fieldResolversForType = typeToFieldResolversMap[type];

    Object.keys(schema._typeMap[type]._fields).forEach(field => {
      if (type === 'Subscription') {
        schema._typeMap[type]._fields[field].subscribe =
          fieldResolversForType && fieldResolversForType[field].subscribe;
        schema._typeMap[type]._fields[field].resolve =
          fieldResolversForType && fieldResolversForType[field].resolve;
      } else {
        schema._typeMap[type]._fields[field].resolve =
          fieldResolversForType && fieldResolversForType[field];
      }
      // if resolve is set to undefined, then graphql uses default resolvers so we're good
    });
  });

  return schema
}

const assert = (condition, failureMessage) => {
  if (condition) {
    throw new Error(failureMessage)
  }
};

const validateRequest = o => {
  // validates based on docs for graphql function: https://graphql.org/graphql-js/graphql/#graphql
  // Also, it normalizes the input object to always be of shape given below.
  const objectShape = `{
  req: string // any supported request string such as Query, Mutation or Subscription
  variables?: { [key: string]: any }
  root?: any
  context?: any
  operationToRun?: string
}`;
  assert(
    !o || Array.isArray(o),
    `Request should be a string or an object with shape ${objectShape}`
  );

  if (typeof o === 'string') {
    return { req: o }
  }

  assert(o.req && typeof o.req !== 'string', '"req" property of request should be a string');

  if (o.variables) {
    assert(
      Array.isArray(o.variables) || typeof o.variables !== 'object',
      '"variables" property of request should be an object of type { [key: string]: any }'
    );
  }

  if (o.operation) {
    assert(typeof o.operation !== 'string', '"operation" property of request should be a string');
  }

  return o
};

// Taken from https://github.com/leebyron/iterall/blob/master/index.mjs
const SYMBOL = typeof Symbol === 'function' ? Symbol : void 0;
const SYMBOL_ASYNC_ITERATOR = SYMBOL && SYMBOL.asyncIterator;

function getAsyncIteratorMethod(asyncIterable) {
  if (asyncIterable != null) {
    var method =
      (SYMBOL_ASYNC_ITERATOR && asyncIterable[SYMBOL_ASYNC_ITERATOR]) ||
      asyncIterable['@@asyncIterator'];
    if (typeof method === 'function') {
      return method
    }
  }
}

// Taken from https://github.com/leebyron/iterall/blob/master/index.mjs
function isAsyncIterable(obj) {
  return !!getAsyncIteratorMethod(obj)
}

function getQueryRunner(args) {
  const schema = args.schema ? args.schema : makeExecutableSchema(args);

  return {
    graphql: async requestStringOrObject => {
      const { req, variables, root, context, operationToRun } = validateRequest(
        requestStringOrObject
      );

      return graphql(schema, req, root, context, variables, operationToRun)
    },

    subscribe: async requestStringOrObject => {
      const { req, variables, root, context, operationToRun } = validateRequest(
        requestStringOrObject
      );
      const parsedReqAsDocument = parse(req);

      // Note that we pass the _parsed_ request here since that's what subscribe expects
      // Also, return type of subscribe is
      // Promise<AsyncIterableIterator<ExecutionResult<T>> | ExecutionResult<T>>
      // That is normalized to Promise<AsyncIterable<ExecutionResult<T>>> by the code below
      // for subscription queries. Also, that is reflected in types.d.ts
      const asyncIterableOrExecutionResult = await subscribe(
        schema,
        parsedReqAsDocument,
        root,
        context,
        variables,
        operationToRun
      );

      // Rest of the code in this block is to ensure that if a subscription request is used,
      // the user always gets back an async iterable. This removes the burden of performing
      // this check from the user while also removing the need to expose a different api for
      // running subscriptions requests (as graphql does using the `subscribe` function).
      // Thus the user can safely use for-await-of on a subscription request and if there are
      // any errors the async iterator will yield the error wrapped in an ExecutionResult and end.
      // If there are no errors, the AsyncIterableIterator instance returned by the subscribe
      // function call is used as it is both an iterable and iterator so it matches our return
      // type.
      if (!isAsyncIterable(asyncIterableOrExecutionResult)) {
        const $$asyncIterator = SYMBOL_ASYNC_ITERATOR || '@@asyncIterator';

        // manually writing an async iterator since async * notation support is bad as of Dec 2019
        return {
          [$$asyncIterator]() {
            return {
              _once: false,
              next() {
                // emit the ExecutionResult and end
                if (!this._once) {
                  this._once = true;
                  return Promise.resolve({ value: asyncIterableOrExecutionResult, done: false })
                }

                return Promise.resolve({ done: true })
              }
            }
          }
        }
      }
      // return as-is when the result is an async iterable
      return asyncIterableOrExecutionResult
    }
  }
}

const gql = String.raw;

export { getQueryRunner, gql, makeExecutableSchema };
//# sourceMappingURL=serverless-gql.esm.js.map
