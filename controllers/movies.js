import { validateMovie, validatePartialMovie } from '../schemas/movies.js'

export class MovieController {

  constructor({movieModel}){
    this.movieModel = movieModel
  }

  getAll = async (req, res) => {
  try {
    const { genre } = req.query;
    const movies = await this.movieModel.getAll({ genre });
    res.json(movies);
  } catch (e) {
    // Opcional: log del error en servidor
    // console.error('Error in getAll:', error);
    res.status(500).json({ error: 'Error fetching movies' });
  }
}

  getById = async (req, res) => {
    try{
      const { id } = req.params
      const movie = await this.movieModel.getById({ id })
      if (movie) return res.json(movie)
      res.status(404).json({ message: 'Movie not found' })
  
    }catch(e){
      res.status(500).json({ error: 'Error fetching movie' });
    }
  }

  create = async (req, res) => {
  try {
    const result = validateMovie(req.body);

    if (!result.success) {
      return res.status(422).json({ errors: result.error.format() });
    }

    const newMovie = await this.movieModel.create({ input: result.data });
    res.status(201).json(newMovie);

  } catch (e) {
    res.status(500).json({ error: 'Error creating movie' });
  }
}

  delete = async (req, res) => {
    try {
      const { id } = req.params

      const result = await this.movieModel.delete({ id })

      if (result === false) {
        return res.status(404).json({ message: 'Movie not found' })
      }

      return res.json({ message: 'Movie deleted' })  
    } catch (e) {
      res.status(500).json({ error: 'Error deleting movie' });
    }   
  }

  update = async (req, res) => {
    try {
      const result = validatePartialMovie(req.body)

      if (!result.success) {
        return res.status(422).json({ errors: result.error.format() });
      }

      const { id } = req.params

      const updatedMovie = await this.movieModel.update({ id, input: result.data })

      return res.json(updatedMovie)  
    } catch (e) {
      res.status(500).json({ error: 'Error updating movie' });
    }
  }
}