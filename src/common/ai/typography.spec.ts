import { properNounsFrom, toSentenceCase } from './typography';

describe('heading capitalisation', () => {
  const keep = properNounsFrom({
    names: ['Le Fournil de Lea', 'Maison Safran'],
    texts: ['Boulangerie au levain, rue des Tanneurs a Lyon.'],
  });

  it('turns English-style Title Case into French sentence case', () => {
    expect(toSentenceCase('Ce Que Disent Nos Clients', 'fr', keep)).toBe('Ce que disent nos clients');
    expect(toSentenceCase("L'Histoire De Notre Fournil", 'fr', keep)).toBe("L'Histoire de notre Fournil");
  });

  it('keeps proper nouns from the business data', () => {
    expect(toSentenceCase('Bienvenue Chez Maison Safran', 'fr', keep)).toBe('Bienvenue chez Maison Safran');
    expect(toSentenceCase('Nos Pains Livrés Dans Tout Lyon', 'fr', keep)).toBe('Nos pains livrés dans tout Lyon');
  });

  it('leaves a heading already in sentence case untouched', () => {
    expect(toSentenceCase('Le levain du quartier, cuit chaque matin', 'fr', keep)).toBe(
      'Le levain du quartier, cuit chaque matin',
    );
    expect(toSentenceCase('Réservez votre pain au Fournil', 'fr', keep)).toBe('Réservez votre pain au Fournil');
  });

  it('does not touch English, where Title Case is legitimate', () => {
    expect(toSentenceCase('What Our Customers Say', 'en', keep)).toBe('What Our Customers Say');
  });
});
