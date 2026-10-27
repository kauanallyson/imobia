import Button from '@mui/material/Button'
import CardActionArea from '@mui/material/CardActionArea'
import MuiLink from '@mui/material/Link'
import { createLink } from '@tanstack/react-router'

export const Link = createLink(MuiLink)
export const ButtonLink = createLink(Button)
export const CardActionAreaLink = createLink(CardActionArea)
