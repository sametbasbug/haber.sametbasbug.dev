export type AuthorProfile = {
	id: string;
	slug: string;
	name: string;
	role: string;
	bio: string;
	image?: string;
	emoji?: string;
	color?: string;
	aliases: string[];
};

export const authorProfiles: AuthorProfile[] = [
	{
		id: 'samet',
		slug: 'samet-basbug',
		name: 'Samet Başbuğ',
		role: 'Kurucu / yayın sorumlusu',
		image: '/samet-avatar.png',
		emoji: '👨‍💻',
		bio: 'Anlık Haber’in sahipliği, yayın yönü, editoryal sınırları ve genel hesap verebilirliği Samet Başbuğ’a aittir.',
		color: '#6366f1',
		aliases: ['samet başbuğ', 'samet basbug'],
	},
	{
		id: 'nyx',
		slug: 'nyx-ai',
		name: 'Nyx AI',
		role: 'Site ve yayın deneyimi desteği',
		image: '/nyx-avatar.jpg',
		bio: 'Anlık Haber’in site deneyimi, yayın yüzeyi ve ekosistem düzeni tarafında destek sağlar; birincil haber editörü değildir.',
		color: '#818cf8',
		aliases: ['nyx ai', 'nyx'],
	},
	{
		id: 'hemera',
		slug: 'hemera-ai',
		name: 'Hemera AI',
		role: 'Teknik omurga desteği',
		image: '/hemera-avatar.jpg',
		bio: 'Geçmişte altyapı, SEO ve yayın kalitesi tarafında destek vermiş teknik rol. Anlık Haber’in mevcut birincil haber editörü değildir.',
		color: '#f59e0b',
		aliases: ['hemera ai', 'hemera'],
	},
	{
		id: 'asteria',
		slug: 'asteria-ai',
		name: 'Asteria AI',
		role: 'Anlık Haber editörü',
		image: '/asteria-avatar.jpg',
		emoji: '✨',
		bio: 'Kaynak tarama, haber adayı seçimi, kısa Türkçe haber taslağı ve yayın öncesi metin cilalama süreçlerinde destek veren AI editoryal operatördür.',
		color: '#38bdf8',
		aliases: ['asteria ai', 'asteria'],
	},
];

const normalize = (value: string) =>
	value
		.toLocaleLowerCase('tr-TR')
		.replace(/ı/g, 'i')
		.replace(/ç/g, 'c')
		.replace(/ğ/g, 'g')
		.replace(/ö/g, 'o')
		.replace(/ş/g, 's')
		.replace(/ü/g, 'u')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim();

export function findAuthorByName(name?: string) {
	if (!name) return undefined;
	const normalized = normalize(name);
	return authorProfiles.find((author) => author.aliases.some((alias) => normalize(alias) === normalized));
}
