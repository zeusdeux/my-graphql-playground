import {
  ApolloServer,
  makeExecutableSchema as makeExecutableSchemaApollo,
  AuthenticationError,
} from 'apollo-server'
import { gql, makeExecutableSchema, getQueryRunner } from '@zeusdeux/serverless-graphql'

const AuthorDB = {}
const BookDB = {}

const delay = (ms) => {
  return new Promise((res) => {
    setTimeout(res, ms)
  })
}

const typeDefs = gql`
  type Query {
    authors: [Author]!
    author(name: String!): Author!
    books: [Book]!
    cat: Cat!
  }

  type Cat {
    name: String!
    age: Int!
  }

  type Author {
    name: String!
    age: Int!
    addedAt: String!
    books: [Book]!
  }

  type Book {
    name: String!
    publisher: String!
    publishedYear: Int!
    authors: [Author!]
  }

  input AuthorInput {
    name: String!
    age: Int!
  }

  input BookInput {
    name: String!
    publisher: String!
    publishedYear: Int!
  }

  type Mutation {
    addAuthor(author: AuthorInput!): Author!
    addBookForAuthor(authorName: String!, book: BookInput): Book!
  }

  type Subscription {
    getNumber: Int!
  }
`

const resolvers = {
  Query: {
    cat() {
      return {
        name: 'Catty',
      }
    },
    authors() {
      return Object.values(AuthorDB)
    },
    async author(_, { name }) {
      await delay(2000)

      if (name in AuthorDB) {
        return AuthorDB[name]
      }

      throw new Error(`No author named ${name} found in database`)
    },
    books() {
      return Object.values(BookDB)
    },
  },

  // Author: {}, // not providing this let's us use the default resolvers

  Mutation: {
    async addAuthor(_, { author }) {
      await delay(2500)

      const { name, age } = author

      // add author if it doesn't exist in DB
      if (!(name in AuthorDB)) {
        AuthorDB[name] = {
          name,
          age,
          addedAt: new Date().toISOString(),
          books: [],
        }
      }

      return AuthorDB[name]
    },

    async addBookForAuthor(_, { authorName, book: { name: bookName, publisher, publishedYear } }) {
      await delay(2500)

      if (authorName in AuthorDB) {
        const author = AuthorDB[authorName]
        const authorHasBook = !!author.books.filter((book) => book.name === bookName).length
        const bookIdx = `${bookName}:${publisher}:${publishedYear}`
        const book = BookDB[bookIdx]

        if (authorHasBook) {
          return book
        }

        if (book) {
          book.authors.push(author)
          BookDB[bookIdx] = book
        } else {
          BookDB[bookIdx] = {
            name: bookName,
            publisher,
            publishedYear,
            authors: [author],
          }
        }

        author.books.push(BookDB[bookIdx])

        return BookDB[bookIdx]
      }

      throw new Error(`Author with name ${name} not found`)
    },
  },

  Subscription: {
    getNumber: {
      subscribe: () => {
        throw new Error('omg')
      },
      resolve: (r) => r,
    },
  },
}

async function* sendNumber() {
  let x = 1
  while (x < 5) {
    await delay(1000)
    console.log('here', x)
    // yield {
    //   getNumber: x++
    // }
    yield x++
  }
  return x
}

const schema = makeExecutableSchema({ typeDefs, resolvers })
const schema2 = makeExecutableSchemaApollo({
  typeDefs: gql`
    enum AllowedColor {
      RED
      GREEN
      BLUE
    }

    type Query {
      random: Int!
      favoriteColor: AllowedColor # As a return value
      id(color: AllowedColor): AllowedColor # As an argument and return value
      currentUser: UserResult!
      currentUser2: User
    }

    type User {
      id: ID!
      email: String!
    }

    type AuthRes {
      code: String!
      success: Boolean!
      message: String!
      invalid: AuthInvalid
    }

    enum AuthInvalid {
      INVALID_CREDENTIALS
      INVALID_USERNAME
      INVALID_PASSWORD
      INVALID_SLUG
    }

    union UserResult = User | AuthRes
  `,
  resolvers: {
    AllowedColor: {
      RED: '#f00',
      GREEN: '#0f0',
      BLUE: '#00f',
    },
    Query: {
      // globally accessible data without the need to be a valid user
      random: () => Math.trunc(Math.random() * 10),
      favoriteColor: () => '#f00',
      id: (root, args) => {
        // return '#fff'
        return args.color
      },
      // instead of throwing on an invalid user which would make it
      // impossible to request data available to a non-authenticated user
      // such as "favoriteColor" and "avatar" as thrown error would cause data to be null
      // in the response. With this UserResult approach, we can return whatever data the resolvers
      // resolved to and for currentUser, we can return a valid user if user is authenticated
      // or a failed authentication result thus making the system more resilient.
      currentUser: (parent, args, ctx) => {
        const authResResponse = {
          _type: 'AuthRes',
          code: '401',
          invalid: 'INVALID_CREDENTIALS',
          message: 'No user logged in',
          success: false,
        }
        const user = {
          _type: 'User',
          id: 1,
          email: 'test@omg.xxx',
        }

        return Math.floor(Math.random() * 10) % 2 === 0 ? authResResponse : user
      },

      currentUser2: () => new Error('you are dead to me'),
    },
    UserResult: {
      __resolveType: (parent) => parent._type,
    },
  },
})
// console.log(schema)

const server = new ApolloServer({
  schema: schema2,
  introspection: true,
  playground: true,
})

server.listen({ port: 9090 }).then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`)
})

// async function main() {
//   const q = getQueryRunner({ typeDefs, resolvers })
//   for await (let x of await q('subscription { getNumber }')) {
//     console.log('omg', x)
//   }
// }

// main().catch(err => console.log.bind('oops', err))
