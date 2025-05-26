import mysql from "mysql2/promise"

const DEFAULT_CONFIG={
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    port: process.env.DB_PORT,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
}

const config = process.env.DB_URL ?? DEFAULT_CONFIG
const conection = await mysql.createConnection(config)

export class MovieModel {

  static async getAll({ genre }) {
    try {
      
      let rows;

      if (genre) {
        const [movieIds] = await conection.query(`
          SELECT m.id
          FROM movie m
          JOIN movie_genre mg ON m.id = mg.movie_id
          JOIN genre g ON mg.genre_id = g.id
          WHERE LOWER(g.name) = ?
        `, [genre.toLowerCase()])

        if (movieIds.length === 0) return []

        const idPlaceholders = movieIds.map(() => '?').join(', ')
        const idValues = movieIds.map(row => row.id)

        const [resultRows] = await conection.query(`
          SELECT 
            m.title, 
            m.year, 
            m.director, 
            m.duration, 
            m.poster, 
            m.rate, 
            BIN_TO_UUID(m.id) as id,
            g.name as genre
          FROM movie m
          JOIN movie_genre mg ON m.id = mg.movie_id
          JOIN genre g ON mg.genre_id = g.id
          WHERE m.id IN (${idPlaceholders})
        `, idValues)

        rows = resultRows
      } else {
        const [resultRows] = await conection.query(`
          SELECT 
            m.title, 
            m.year, 
            m.director, 
            m.duration, 
            m.poster, 
            m.rate, 
            BIN_TO_UUID(m.id) as id,
            g.name as genre
          FROM movie m
          LEFT JOIN movie_genre mg ON m.id = mg.movie_id
          LEFT JOIN genre g ON mg.genre_id = g.id
        `)

        rows = resultRows
      }

      // Agrupar por película y acumular géneros
      const moviesMap = new Map()

      for (const row of rows) {
        if (!moviesMap.has(row.id)) {
          moviesMap.set(row.id, {
            id: row.id,
            title: row.title,
            year: row.year,
            director: row.director,
            duration: row.duration,
            poster: row.poster,
            rate: row.rate,
            genre: row.genre ? [row.genre] : []
          })
        } else {
          const movie = moviesMap.get(row.id)
          if (row.genre && !movie.genre.includes(row.genre)) {
            movie.genre.push(row.genre)
          }
        }
      }

      return Array.from(moviesMap.values())
      
    } catch (e) {
      throw new Error('Error recovering movies');
    }
    
  }


  static async getById({ id }) {
    try {
      const [rows] = await conection.query(
        `
        SELECT 
          m.title, 
          m.year, 
          m.director, 
          m.duration, 
          m.poster, 
          m.rate,
          BIN_TO_UUID(m.id) as id,
          g.name as genre
        FROM movie m
        LEFT JOIN movie_genre mg ON m.id = mg.movie_id
        LEFT JOIN genre g ON mg.genre_id = g.id
        WHERE BIN_TO_UUID(m.id) = ?
        `,
        [id]
      )

      if (rows.length === 0) return null

      // Agrupar los géneros en un array (habrá una fila por género)
      const movie = {
        id: rows[0].id,
        title: rows[0].title,
        year: rows[0].year,
        director: rows[0].director,
        duration: rows[0].duration,
        poster: rows[0].poster,
        rate: rows[0].rate,
        genre: []
      }

      for (const row of rows) {
        if (row.genre && !movie.genre.includes(row.genre)) {
          movie.genre.push(row.genre)
        }
      }

      return movie

    } catch (e) {
      
      throw new Error('Error recovering movie')
    }
  }


  static async create ({ input }) {

    try {

      const {
        genre: genreInput, // genre is an array
        title,
        year,
        duration,
        director,
        rate,
        poster
      } = input
  
      // crypto.randomUUID()
      const [uuidResult] = await conection.query('SELECT UUID() uuid;')
      const [{ uuid }] = uuidResult

      await conection.query(
        `INSERT INTO movie (id, title, year, director, duration, poster, rate)
        VALUES (UUID_TO_BIN("${uuid}"), ?, ?, ?, ?, ?, ?);`,
        [title, year, director, duration, poster, rate]
      )

      const [genreRows] = await conection.query(
        `SELECT id, name FROM genre WHERE name IN (?);`,
        [genreInput]
      );

      if (genreRows.length !== genreInput.length) {
        throw new Error('Some genres in the input are invalid or not found in the database.');
      }

      // 3. Insertar en tabla intermedia movie_genre
      const genreValues = genreRows.map(({ id }) => [uuid, id]); // BIN-UUID → BIN
      await conection.query(
        `INSERT INTO movie_genre (movie_id, genre_id) VALUES ${genreValues.map(() => '(UUID_TO_BIN(?), ?)').join(', ')}`,
        genreValues.flat()
      );

      const movie = await this.getById({ id: uuid });

      return movie

    } catch (e) {
      // puede enviarle información sensible
      throw new Error('Error creating movie')
      // enviar la traza a un servicio interno
      // sendLog(e)
    }
  }

  static async delete({ id }) {
    try {
      const [result] = await conection.query(
        'DELETE FROM movie WHERE BIN_TO_UUID(id) = ?;',
        [id]
      );

      if (result.affectedRows === 0) {
        return "No movie found with that ID";
      }

      return "Movie removed";
    } catch (e) {
      
      throw new Error('Error deleting movie');
    }
  }


  static async update({ id, input }) {
    try {
      const { genre: genreInput, ...fieldsToUpdate } = input;

      if (Object.keys(fieldsToUpdate).length > 0) {
        const setClauses = Object.keys(fieldsToUpdate).map(field => `${field} = ?`).join(', ');
        const values = Object.values(fieldsToUpdate);

        await conection.query(
          `UPDATE movie SET ${setClauses} WHERE id = UUID_TO_BIN(?);`,
          [...values, id]
        );
      }

      if (genreInput) {

        const normalizedGenres = genreInput.map(g => g.toLowerCase());
        
        const [genreRows] = await conection.query(
          `SELECT id FROM genre WHERE LOWER(name) IN (?);`,
          [normalizedGenres]
        );

        if (genreRows.length !== normalizedGenres.length) {
          throw new Error('Some genres in the input are invalid or not found in the database.');
        }

        await conection.query(
          'DELETE FROM movie_genre WHERE movie_id = UUID_TO_BIN(?);',
          [id]
        );

        const genreValues = genreRows.map(({ id: genreId }) => [id, genreId]);
        await conection.query(
          `INSERT INTO movie_genre (movie_id, genre_id)
          VALUES ${genreValues.map(() => '(UUID_TO_BIN(?), ?)').join(', ')}`,
          genreValues.flat()
        );
      }

      const movie = await this.getById({ id });
      return movie;

    } catch (e) {
      throw new Error('Error updating movie');
    }
  }

}

