import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

const sampleProducts = [
  {
    name: "Bleu de Chanel",
    description: "Uma fragrância amadeirada e aromática para o homem que desafia as convenções.",
    price: 650.00,
    imageUrl: "https://picsum.photos/seed/bleu/800/800",
    category: "Masculino",
    createdAt: new Date().toISOString()
  },
  {
    name: "Miss Dior",
    description: "Um hino ao amor, emblemático da feminilidade de Dior com um espírito de alta costura.",
    price: 580.00,
    imageUrl: "https://picsum.photos/seed/missdior/800/800",
    category: "Feminino",
    createdAt: new Date().toISOString()
  },
  {
    name: "Sauvage Dior",
    description: "Um ato de criação inspirado em espaços abertos. Um céu azul ozônio que domina uma paisagem rochosa.",
    price: 720.00,
    imageUrl: "https://picsum.photos/seed/sauvage/800/800",
    category: "Masculino",
    createdAt: new Date().toISOString()
  }
];

export const seedProducts = async () => {
  for (const product of sampleProducts) {
    await addDoc(collection(db, 'products'), product);
  }
};
