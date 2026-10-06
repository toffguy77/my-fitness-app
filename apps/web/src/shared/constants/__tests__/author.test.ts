import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { EXPERT_AUTHOR } from '../author'

// Фото автора — часть экспертности статьи для поиска: Person с image.
// Путь в константе обязан вести на настоящий файл, иначе вместо лица — битая
// картинка под именем живого человека.
describe('the expert author', () => {
    it('has a photo, and the file it names exists', () => {
        expect(EXPERT_AUTHOR.photo).toBe('/authors/sergey-burcev.jpg')
        expect(existsSync(join(__dirname, '../../../../public', EXPERT_AUTHOR.photo!))).toBe(true)
    })
})
