import express, { json } from 'express' // require -> commonJS
import { createMovieRouter } from './routes/movies.js'
import "dotenv/config"
import { corsMiddleware } from './middlewares/cors.js'

export const createApp = ({movieModel}) =>{
  
  const app = express()
  app.use(json())
  app.use(corsMiddleware())
  app.disable('x-powered-by')

  app.use('/movies', createMovieRouter({movieModel: movieModel}))

  return app
}
