import { WebsiteGenerationDto } from './website.service';

/**
 * Complete, realistic input for manually testing the website generator.
 * It is intentionally kept separate from production defaults and database seed data.
 */
export const professionalRestaurantWebsiteData = {
  businessName: 'Maison Safran',
  businessType: 'Restaurant gastronomique mediterraneen',
  description:
    'Maison Safran est une table contemporaine a Casablanca qui imagine une cuisine mediterraneenne de saison, ' +
    'inspiree par les produits marocains, les producteurs locaux et les techniques de la gastronomie francaise. ' +
    'Le restaurant propose une experience elegante, chaleureuse et accessible pour les dejeuners, diners et evenements prives.',
  services: [
    'Reservation en ligne',
    'Menu degustation en six temps',
    'Accords mets et vins',
    'Privatisation et repas de groupe',
    'Click and collect du dimanche',
  ],
  products: [
    {
      name: 'Menu Degustation Safran',
      price: '850 MAD',
      description: 'Six services inspires du marche, avec option accord sans alcool.',
      imagePrompt: 'fine dining tasting menu, Moroccan Mediterranean ingredients, elegant restaurant plating',
    },
    {
      name: 'Tajine de lotte grillee',
      price: '320 MAD',
      description: 'Lotte grillee, olives violettes, citron confit et legumes du littoral.',
      imagePrompt: 'elegant grilled fish tagine, preserved lemon, olives, premium restaurant photography',
    },
    {
      name: 'Pastilla pomme et fleur d oranger',
      price: '140 MAD',
      description: 'Feuilles croustillantes, pomme caramellisee, amande et creme legere.',
      imagePrompt: 'refined Moroccan apple pastilla dessert, almond, orange blossom, studio food photography',
    },
  ],
  gallery: {
    enabled: true,
    images: [
      { imagePrompt: 'warm elegant dining room, natural materials, brass details, Casablanca restaurant' },
      { imagePrompt: 'chef plating Mediterranean dish in an open professional kitchen' },
      { imagePrompt: 'terrace dinner table at sunset, refined Moroccan hospitality, no people close-up' },
    ],
  },
  context:
    'Positionnement premium mais accueillant. Clientele: actifs urbains, couples, entreprises et voyageurs exigeants. ' +
    'La marque doit communiquer le terroir, la precision et une hospitalite sincere sans folklore visuel.',
  contactInfo: {
    phone: '+212 5 22 45 67 89',
    email: 'bonjour@maisonsafran.ma',
    whatsapp: '+212 6 61 23 45 67',
    address: '18 rue du Parc, quartier Gauthier, Casablanca, Maroc',
    hours: 'Mar-Sam 12h30-15h00 et 19h00-23h30; Dim 12h30-16h00; Lun ferme',
    mapQuery: '18 rue du Parc, Gauthier, Casablanca, Maroc',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=18%20rue%20du%20Parc%20Gauthier%20Casablanca',
    googleReviewUrl: 'https://www.google.com/maps/search/?api=1&query=Maison%20Safran%20Casablanca',
  },
  colors: {
    primary: '#173B2F',
    secondary: '#F5F0E8',
    accent: '#C58B3A',
  },
  fontFamily: 'Cormorant Garamond',
  language: 'fr',
  currency: 'MAD',
  template: 'classic',
} satisfies WebsiteGenerationDto;