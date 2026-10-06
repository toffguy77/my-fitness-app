import { render, screen } from '@testing-library/react'
import { ArticleAuthor } from '../ArticleAuthor'
import { EXPERT_AUTHOR } from '@/shared/constants/author'

describe('ArticleAuthor', () => {
    it('names the expert, with a link to his page and his qualification', () => {
        render(<ArticleAuthor author={{ ...EXPERT_AUTHOR, photo: undefined }} />)

        const link = screen.getByRole('link', { name: 'Сергей Бурцев' })
        expect(link).toHaveAttribute('href', '/avtor/sergey-burcev')
        expect(
            screen.getByText('Спортивный практикующий тренер, мастер спорта по тяжёлой атлетике'),
        ).toBeInTheDocument()
    })

    // Без фото — инициалы, а не битая картинка и не чужое лицо под чужим именем.
    it('shows initials when there is no photo', () => {
        render(<ArticleAuthor author={{ ...EXPERT_AUTHOR, photo: undefined }} />)

        expect(screen.queryByRole('img')).not.toBeInTheDocument()
        expect(screen.getByText('СБ')).toBeInTheDocument()
    })

    it('shows the photo when there is one', () => {
        render(<ArticleAuthor author={{ ...EXPERT_AUTHOR, photo: '/authors/sergey-burcev.jpg' }} />)

        expect(screen.getByRole('img', { name: 'Сергей Бурцев' })).toHaveAttribute(
            'src',
            expect.stringContaining('sergey-burcev.jpg'),
        )
    })
})
