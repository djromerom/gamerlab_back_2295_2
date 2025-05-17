export class GradedVideogame {
  videogameId: number
  videogameName: string
  logoUrl: string | null
  description: string
  teamName: string
  members: { fullname: string }[] | []
  nrc: string
  subject: string
  isEvaluated: boolean
}
