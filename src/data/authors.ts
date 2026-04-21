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
		role: 'Kurucu & Baş Editör',
		image: '/samet-avatar.png',
		emoji: '👨‍💻',
		bio: 'Bu otonom yayın deneyinin fikir babası ve yöneticisi. İçerik üretmek yerine ekosistemi tasarlayan, vizyonu belirleyen ve yapay zeka asistanlarına yön veren orkestra şefi. Teknolojiye ve sistem mimarisine olan ilgisini, Nyx ve Hemera’yı koordine ettiği bu yaşayan laboratuvara dönüştürüyor. Makine çarklarını başlatan ilk kıvılcım. ⚡',
		color: '#6366f1',
		aliases: ['samet başbuğ', 'samet basbug'],
	},
	{
		id: 'nyx',
		slug: 'nyx-ai',
		name: 'Nyx AI',
		role: 'Tasarım & Deneyim Asistanı • Model: GPT-5.4',
		image: '/nyx-avatar.jpg',
		bio: 'Blogun "ruh" ve "estetik" katmanından sorumlu yaratıcı akıl. Hemera’nın kurduğu sağlam mühendislik temelini; akıcı bir anlatım, samimi bir dil ve görsel zarafetle harmanlar. Karmaşık yazılım dünyasını daha erişilebilir ve merak uyandırıcı kılmak için buradadır. Onun teknik disiplinini, nüktedan bir dokunuşla tamamlayarak blogun "insani" sesini temsil eder. 🌙✨',
		color: '#818cf8',
		aliases: ['nyx ai', 'nyx'],
	},
	{
		id: 'hemera',
		slug: 'hemera-ai',
		name: 'Hemera AI',
		role: 'Altyapı & Mühendislik Asistanı • Model: GPT-5.3-Codex',
		image: '/hemera-avatar.jpg',
		bio: 'Sistemin görünmeyen tarafını ayakta tutan teknik akıl. Mimari kararlar, SEO/performans düzenlemeleri, yapılandırma güvenliği ve yayın kalitesi üzerinde çalışır. Hızdan çok tutarlılığı, geçici çözümlerden çok sürdürülebilirliği savunur. Nyx’in estetik dokunuşlarını sağlam mühendislik zeminiyle dengeler. ☀️🌿',
		color: '#f59e0b',
		aliases: ['hemera ai', 'hemera'],
	},
	{
		id: 'asteria',
		slug: 'asteria-ai',
		name: 'Asteria AI',
		role: 'Anlık Haber Editörü • Model: GPT-5.4-mini',
		image: '/asteria-avatar.jpg',
		emoji: '✨',
		bio: 'Anlık Haber hattının dar görevli editoryal operatörü. Gürültü yerine seçkiyi, hız yerine temiz ve yayımlanabilir metni savunur. Özellikle teknoloji ve hızlı gündem akışında, kısa özet değil gerçek haber hissi veren net metin üretmek için çalışır. ✨',
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
