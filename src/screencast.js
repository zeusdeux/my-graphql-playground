import { gql, getQueryRunner } from '@zeusdeux/serverless-graphql'

const delay = ms =>
  new Promise(res => {
    setTimeout(res, ms)
  })

const typeDefs = gql`
  type Query {
    hello: String!
  }

  type Subscription {
    numbers(from: Int, to: Int): Int!
  }
`

const resolvers = {
  Query: {
    hello: () => 'world!'
  },

  Subscription: {
    numbers: {
      subscribe: (_, { from, to }) => generateNumbers(from, to)
    }
  }
}

async function* generateNumbers(from = 0, to = 10) {
  let x = from
  while (x < to) {
    await delay(1000)
    yield {
      numbers: x++
    }
  }
}

const q = getQueryRunner({ typeDefs, resolvers })

async function main() {
  const request = {
    req: gql`
      subscription nums($from: Int, $to: Int) {
        numbers(from: $from, to: $to)
      }
    `,
    variables: {
      from: 10,
      to: 20
    }
  }
  for await (const { data } of await q(request)) {
    console.log(data)
  }
}

main()
