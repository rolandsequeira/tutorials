// Ready-made charts the owner can start from in the dashboard. Lengths are in
// cm and weights in kg; the widget converts them for the inch/lb view.
const L = 'length', W = 'weight', T = 'text';
const col = (label, measure) => ({ label, measure });

export const TEMPLATES = [
  {
    key: 'women-tops', name: "Women's clothing", title: "Women's size guide",
    note: 'Chest: around the fullest part. Waist: at the narrowest point. Hips: around the widest part.',
    columns: [col('Size', T), col('EU', T), col('US', T), col('Chest', L), col('Waist', L), col('Hips', L)],
    rows: [
      ['XS', '34', '2', '80-84', '62-66', '88-92'],
      ['S', '36', '4', '84-88', '66-70', '92-96'],
      ['M', '38', '6', '88-92', '70-74', '96-100'],
      ['L', '40', '8', '92-96', '74-78', '100-104'],
      ['XL', '42', '10', '96-102', '78-84', '104-110'],
      ['XXL', '44', '12', '102-108', '84-90', '110-116'],
    ],
  },
  {
    key: 'men-tops', name: "Men's clothing", title: "Men's size guide",
    note: 'Chest: under the arms, around the fullest part. Waist: around your natural waistline.',
    columns: [col('Size', T), col('Chest', L), col('Waist', L), col('Sleeve', L)],
    rows: [
      ['S', '88-96', '73-81', '62'],
      ['M', '96-104', '81-89', '63'],
      ['L', '104-112', '89-97', '64'],
      ['XL', '112-124', '97-109', '65'],
      ['XXL', '124-136', '109-121', '66'],
    ],
  },
  {
    key: 'shoes', name: 'Shoes', title: 'Shoe size guide',
    note: 'Stand on a sheet of paper, mark your heel and longest toe, and measure the distance. Measure in the evening, when feet are largest.',
    columns: [col('EU', T), col('UK', T), col('US men', T), col('US women', T), col('Foot length', L)],
    rows: [
      ['36', '3.5', '4.5', '6', '22.5'], ['37', '4', '5', '6.5', '23.2'], ['38', '5', '6', '7.5', '23.9'],
      ['39', '6', '7', '8.5', '24.6'], ['40', '6.5', '7.5', '9', '25.2'], ['41', '7.5', '8.5', '10', '25.9'],
      ['42', '8', '9', '10.5', '26.6'], ['43', '9', '10', '11.5', '27.3'], ['44', '9.5', '10.5', '12', '27.9'],
      ['45', '10.5', '11.5', '13', '28.6'], ['46', '11', '12', '13.5', '29.3'],
    ],
  },
  {
    key: 'gloves', name: 'Gloves (hand size)', title: 'Glove size guide',
    note: 'Wrap the tape around your dominant hand at the widest point, just below the knuckles, without the thumb.',
    columns: [col('Size', T), col('Hand circumference', L), col('Hand length', L)],
    rows: [
      ['XS (6)', '15-16.5', '16-17'], ['S (7)', '16.5-18', '17-18'], ['M (8)', '18-20', '18-19'],
      ['L (9)', '20-22', '19-20'], ['XL (10)', '22-24', '20-21'], ['XXL (11)', '24-26', '21-22'],
    ],
  },
  {
    key: 'boxing-gloves', name: 'Boxing gloves (weight)', title: 'Boxing glove guide',
    note: 'Pick the glove weight by your body weight and use. Heavier gloves protect sparring partners better.',
    columns: [col('Glove', T), col('Body weight', W), col('Use', T)],
    rows: [
      ['8 oz', 'up to 45', 'Kids, competition'], ['10 oz', '45-60', 'Bag work, competition'],
      ['12 oz', '60-75', 'Training, light sparring'], ['14 oz', '75-90', 'Training, sparring'],
      ['16 oz', '90+', 'Sparring'],
    ],
  },
  {
    key: 'kids', name: 'Kids', title: "Kids' size guide",
    note: 'Measure height without shoes, standing straight against a wall.',
    columns: [col('Age', T), col('Height', L), col('Chest', L), col('Waist', L)],
    rows: [
      ['2-3', '92-98', '52-54', '50-52'], ['3-4', '98-104', '54-56', '51-53'], ['4-5', '104-110', '56-58', '52-54'],
      ['6-7', '116-122', '60-62', '54-56'], ['8-9', '128-134', '64-67', '57-59'], ['10-11', '140-146', '70-73', '60-62'],
      ['12-13', '152-158', '76-80', '63-66'],
    ],
  },
  {
    key: 'pants', name: 'Pants & jeans', title: 'Pants size guide',
    note: 'Inseam: from the crotch to the bottom of the ankle, measured on a pair of pants that fit you well.',
    columns: [col('Waist size (in)', T), col('Waist', L), col('Hips', L), col('Inseam', L)],
    rows: [
      ['28', '71', '89', '81'], ['30', '76', '94', '81'], ['32', '81', '99', '81'],
      ['34', '86', '104', '81'], ['36', '91', '109', '81'], ['38', '97', '114', '81'],
    ],
  },
];
