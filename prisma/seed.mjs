/**
 * DinkUp — Master Database Seed Script for Chandigarh Tricity
 * 
 * Target Database: PostgreSQL 16 (Neon / Local)
 * Covers:
 *  - 1 Admin + 4 Hosts + 10 Authentic Players (Argon2 hashed passwords)
 *  - 8 Diverse Tricity Venues (Chandigarh, Mohali, Panchkula, Zirakpur)
 *  - 24 Courts with realistic surfaces, types, and pricing
 *  - Weekly recurring schedules (Mon-Sun) with weekend peak overrides
 *  - 7 Days of materialized bookable slots per court
 *  - 8 Authentic Open Games with confirmed bookings, payments, and seat splits
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Helper to format dates YYYY-MM-DD
function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function addDays(baseDate, days) {
  const result = new Date(baseDate);
  result.setDate(result.getDate() + days);
  return result;
}

const DAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

async function main() {
  console.log('🚀 Starting DinkUp database seeding...\n');
  const defaultPasswordHash = await argon2.hash('Password123!');

  // ─────────────────────────────────────────────
  // 1. SEED USERS (Admin, Hosts & Players)
  // ─────────────────────────────────────────────
  console.log('👤 Seeding Users (Admin, Hosts, and Players)...');

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@dinkup.in' },
    update: { role: 'ADMIN', name: 'Arsh Arora (Admin)' },
    create: {
      email: 'admin@dinkup.in',
      name: 'Arsh Arora (Admin)',
      phone: '+919800000001',
      password: defaultPasswordHash,
      role: 'ADMIN',
    },
  });

  // Hosts
  const hostDefs = [
    {
      email: 'garry@dinkinghub.in',
      name: "Gurkirat 'Garry' Dhillon",
      phone: '+919814112345',
      role: 'HOST',
    },
    {
      email: 'simi@lakeclubdinkers.com',
      name: "Simran 'Simi' Bedi",
      phone: '+919872054321',
      role: 'HOST',
    },
    {
      email: 'raman@tpcmohali.com',
      name: 'Ramanjeet Singh',
      phone: '+919888099887',
      role: 'HOST',
    },
    {
      email: 'vicky@baselinearena.com',
      name: "Vikramjit 'Vicky' Khurana",
      phone: '+919876544321',
      role: 'HOST',
    },
    {
      email: 'host@dinkup.in',
      name: 'Demo Host Manager',
      phone: '+919888123456',
      role: 'HOST',
    },
  ];

  const hostsByEmail = {};
  for (const h of hostDefs) {
    const created = await prisma.user.upsert({
      where: { email: h.email },
      update: { name: h.name, phone: h.phone, role: 'HOST' },
      create: {
        email: h.email,
        name: h.name,
        phone: h.phone,
        password: defaultPasswordHash,
        role: 'HOST',
      },
    });
    hostsByEmail[h.email] = created;
  }

  // Players
  const playerDefs = [
    {
      email: 'aman.cheema88@gmail.com',
      name: 'Amanpreet Cheema',
      phone: '+919876123410',
    },
    {
      email: 'rhea.kapoor.arch@gmail.com',
      name: 'Rhea Kapoor',
      phone: '+919814088231',
    },
    {
      email: 'garry.sodhi@sodhicapital.in',
      name: "Gurkirat 'Garry' Sodhi",
      phone: '+919888455120',
    },
    {
      email: 'simrat.dhillon93@outlook.com',
      name: 'Simrat Dhillon',
      phone: '+919779211456',
    },
    {
      email: 'tj.joshi.pec@gmail.com',
      name: "Tarunveer 'TJ' Joshi",
      phone: '+919501567890',
    },
    {
      email: 'harleen.bawa.sports@gmail.com',
      name: 'Harleen Kaur Bawa',
      phone: '+919815543219',
    },
    {
      email: 'dr.vmehra.ortho@gmail.com',
      name: 'Dr. Vikramaditya Mehra',
      phone: '+919872277800',
    },
    {
      email: 'pooja.sehgal.ux@gmail.com',
      name: 'Pooja Sehgal',
      phone: '+919888933214',
    },
    {
      email: 'arjun@drinkbotanics.in',
      name: 'Arjun Batra',
      phone: '+919876011988',
    },
    {
      email: 'navdeep.sandhu.tt@gmail.com',
      name: 'Navdeep Singh Sandhu',
      phone: '+919463045671',
    },
    {
      email: 'player@dinkup.in',
      name: 'Demo Player',
      phone: '+919999900001',
    },
  ];

  const playersByEmail = {};
  for (const p of playerDefs) {
    const created = await prisma.user.upsert({
      where: { email: p.email },
      update: { name: p.name, phone: p.phone, role: 'PLAYER' },
      create: {
        email: p.email,
        name: p.name,
        phone: p.phone,
        password: defaultPasswordHash,
        role: 'PLAYER',
      },
    });
    playersByEmail[p.email] = created;
  }

  console.log(`✓ Seeded ${Object.keys(hostsByEmail).length} Hosts and ${Object.keys(playersByEmail).length} Players.\n`);

  // ─────────────────────────────────────────────
  // 2. SEED VENUES & COURTS
  // ─────────────────────────────────────────────
  console.log('🏟️  Seeding Venues, Photos, and Courts...');

  const venueDefs = [
    {
      slug: 'the-dinking-hub-sec-42',
      name: 'The Dinking Hub at Sec 42',
      hostEmail: 'garry@dinkinghub.in',
      city: 'CHANDIGARH',
      area: 'Sector 42 Sports Corridor',
      address: 'Complex Access Road, Adjacent to Sector 42 Lake & Hockey Stadium, Sector 42-B, Chandigarh 160036',
      description: 'Chandigarh’s premier competitive pickleball venue adjacent to Sector 42 Lake. Features 4 tournament-grade cushioned acrylic courts, 350-lux LED floodlights, Franklin and Selkirk paddle rentals, ball machine drills, and a vibrant sports kiosk.',
      googleMapsUrl: 'https://maps.google.com/?q=30.7258,76.7441',
      latitude: 30.7258,
      longitude: 76.7441,
      hasLighting: true,
      hasEquipmentRental: true,
      hasParking: true,
      hasWashroom: true,
      hasDrinkingWater: true,
      contactPhone: '+919814112345',
      whatsappNumber: '919814112345',
      contactEmail: 'garry@dinkinghub.in',
      cancellationCutoffHours: 6,
      images: [
        { url: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?auto=format&fit=crop&w=1200&q=80', isCover: true, displayOrder: 1 },
        { url: 'https://images.unsplash.com/photo-1544919982-b61976f0ba43?auto=format&fit=crop&w=1200&q=80', isCover: false, displayOrder: 2 },
      ],
      courts: [
        { name: 'Court 1 - Stadium Centre Court', surface: 'CUSHIONED_ACRYLIC', type: 'OUTDOOR', basePricePerHour: 650, weekendPeak: 800 },
        { name: 'Court 2 - North Pavilion Court', surface: 'CUSHIONED_ACRYLIC', type: 'OUTDOOR', basePricePerHour: 600, weekendPeak: 750 },
        { name: 'Court 3 - South Pavilion Court', surface: 'CUSHIONED_ACRYLIC', type: 'OUTDOOR', basePricePerHour: 600, weekendPeak: 750 },
        { name: 'Court 4 - The Practice Court', surface: 'ACRYLIC_HARD', type: 'OUTDOOR', basePricePerHour: 500, weekendPeak: 650 },
      ],
    },
    {
      slug: 'lake-club-dinkers-and-cafe',
      name: 'Lake Club Dinkers & Cafe',
      hostEmail: 'simi@lakeclubdinkers.com',
      city: 'CHANDIGARH',
      area: 'Sector 8 / Sukhna Vicinity',
      address: 'Uttar Marg, Near Sukhna Lake Promenade & Sector 8-B Boulevard, Chandigarh 160008',
      description: 'Lush, upscale lifestyle club nestled near Sukhna Lake. Features 2 cushioned acrylic courts and 1 UV-shaded rooftop court, an artisanal specialty coffee bar, luxury locker suites, and EV charging stations.',
      googleMapsUrl: 'https://maps.google.com/?q=30.7380,76.8010',
      latitude: 30.7380,
      longitude: 76.8010,
      hasLighting: true,
      hasEquipmentRental: true,
      hasParking: true,
      hasWashroom: true,
      hasDrinkingWater: true,
      contactPhone: '+919872054321',
      whatsappNumber: '919872054321',
      contactEmail: 'simi@lakeclubdinkers.com',
      cancellationCutoffHours: 12,
      images: [
        { url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80', isCover: true, displayOrder: 1 },
      ],
      courts: [
        { name: 'Court 1 - The Promenade Deck', surface: 'CUSHIONED_ACRYLIC', type: 'OUTDOOR', basePricePerHour: 750, weekendPeak: 900 },
        { name: 'Court 2 - Garden Court', surface: 'CUSHIONED_ACRYLIC', type: 'OUTDOOR', basePricePerHour: 700, weekendPeak: 850 },
        { name: 'Court 3 - The Shaded Rooftop', surface: 'CUSHIONED_ACRYLIC', type: 'COVERED_ROOFTOP', basePricePerHour: 800, weekendPeak: 950 },
      ],
    },
    {
      slug: 'sector-10-heritage-courts',
      name: 'Sector 10 Heritage Courts',
      hostEmail: 'garry@dinkinghub.in',
      city: 'CHANDIGARH',
      area: 'Sector 10 Cultural Belt',
      address: 'Leisure Valley Road, Sector 10-C, Chandigarh 160011',
      description: 'Collegiate and energetic open-air community courts along the Sector 10 cultural boulevard. Fast hard courts under mature trees, evening floodlights, and a social cafe crowd.',
      googleMapsUrl: 'https://maps.google.com/?q=30.7510,76.7905',
      latitude: 30.7510,
      longitude: 76.7905,
      hasLighting: true,
      hasEquipmentRental: true,
      hasParking: true,
      hasWashroom: true,
      hasDrinkingWater: true,
      contactPhone: '+919814112346',
      whatsappNumber: '919814112345',
      contactEmail: 'heritage10@dinkinghub.in',
      cancellationCutoffHours: 4,
      images: [
        { url: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80', isCover: true, displayOrder: 1 },
      ],
      courts: [
        { name: 'Court 1 - Leisure Valley Court', surface: 'ACRYLIC_HARD', type: 'OUTDOOR', basePricePerHour: 450, weekendPeak: 550 },
        { name: 'Court 2 - Museum Side Court', surface: 'ACRYLIC_HARD', type: 'OUTDOOR', basePricePerHour: 450, weekendPeak: 550 },
      ],
    },
    {
      slug: 'tpc-mohali',
      name: 'Tricity Pickleball Club (TPC) Mohali',
      hostEmail: 'raman@tpcmohali.com',
      city: 'MOHALI',
      area: 'Phase 8 Industrial / Bestech Vicinity',
      address: 'Plot C-128, Industrial Area Phase 8, Sector 72, Mohali, Punjab 160071',
      description: 'State-of-the-art indoor climate-controlled pickleball arena in the heart of Mohali’s tech corridor. Features 3 tournament courts, acoustic noise dampening, automated ball machines, and premium shower lockers.',
      googleMapsUrl: 'https://maps.google.com/?q=30.7050,76.7110',
      latitude: 30.7050,
      longitude: 76.7110,
      hasLighting: true,
      hasEquipmentRental: true,
      hasParking: true,
      hasWashroom: true,
      hasDrinkingWater: true,
      contactPhone: '+919888099887',
      whatsappNumber: '919888099887',
      contactEmail: 'raman@tpcmohali.com',
      cancellationCutoffHours: 6,
      images: [
        { url: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80', isCover: true, displayOrder: 1 },
      ],
      courts: [
        { name: 'Court 1 - Centre Court Pro (AC)', surface: 'CUSHIONED_ACRYLIC', type: 'INDOOR', basePricePerHour: 750, weekendPeak: 900 },
        { name: 'Court 2 - Silicon Blue Court (AC)', surface: 'CUSHIONED_ACRYLIC', type: 'INDOOR', basePricePerHour: 700, weekendPeak: 850 },
        { name: 'Court 3 - The Drill & Ball Machine Court', surface: 'CUSHIONED_ACRYLIC', type: 'INDOOR', basePricePerHour: 650, weekendPeak: 800 },
      ],
    },
    {
      slug: 'jlpl-smash-zone-arena',
      name: 'JLPL Smash Zone Arena',
      hostEmail: 'raman@tpcmohali.com',
      city: 'MOHALI',
      area: 'Sector 82 JLPL / IT City',
      address: 'Warehouse 14, JLPL Industrial Area, Sector 82, Mohali, Punjab 160055',
      description: 'Massive 35-foot high-ceiling sports warehouse off Airport Road. 4 indoor courts, 4K camera match recording, pro shop paddle demos, and weekend DUPR rating round-robins.',
      googleMapsUrl: 'https://maps.google.com/?q=30.6650,76.7320',
      latitude: 30.6650,
      longitude: 76.7320,
      hasLighting: true,
      hasEquipmentRental: true,
      hasParking: true,
      hasWashroom: true,
      hasDrinkingWater: true,
      contactPhone: '+919888099888',
      whatsappNumber: '919888099887',
      contactEmail: 'jlpl@tpcmohali.com',
      cancellationCutoffHours: 6,
      images: [
        { url: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=80', isCover: true, displayOrder: 1 },
      ],
      courts: [
        { name: 'Court 1 - Championship Court A', surface: 'CUSHIONED_ACRYLIC', type: 'INDOOR', basePricePerHour: 750, weekendPeak: 900 },
        { name: 'Court 2 - Championship Court B', surface: 'CUSHIONED_ACRYLIC', type: 'INDOOR', basePricePerHour: 700, weekendPeak: 850 },
        { name: 'Court 3 - Speed Arena', surface: 'WOODEN', type: 'INDOOR', basePricePerHour: 650, weekendPeak: 800 },
        { name: 'Court 4 - Challenge Court', surface: 'ACRYLIC_HARD', type: 'INDOOR', basePricePerHour: 600, weekendPeak: 750 },
      ],
    },
    {
      slug: 'baseline-arena-panchkula',
      name: 'Baseline Arena Panchkula',
      hostEmail: 'vicky@baselinearena.com',
      city: 'PANCHKULA',
      area: 'Sector 20 / Tau Devi Lal Hub',
      address: 'Stadium South Link Road, Near Gate 3 Tau Devi Lal Sports Complex, Sector 20, Panchkula 134117',
      description: 'Panchkula’s premier multi-court athletic facility across from Tau Devi Lal Sports Complex. 3 outdoor cushioned acrylic courts, 1 synthetic turf junior court, 400-lux stadium floodlights, and player dugouts.',
      googleMapsUrl: 'https://maps.google.com/?q=30.6780,76.8620',
      latitude: 30.6780,
      longitude: 76.8620,
      hasLighting: true,
      hasEquipmentRental: true,
      hasParking: true,
      hasWashroom: true,
      hasDrinkingWater: true,
      contactPhone: '+919876544321',
      whatsappNumber: '919876544321',
      contactEmail: 'vicky@baselinearena.com',
      cancellationCutoffHours: 6,
      images: [
        { url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1200&q=80', isCover: true, displayOrder: 1 },
      ],
      courts: [
        { name: 'Court 1 - Tau Devi Lal North Court', surface: 'CUSHIONED_ACRYLIC', type: 'OUTDOOR', basePricePerHour: 550, weekendPeak: 700 },
        { name: 'Court 2 - Tau Devi Lal South Court', surface: 'CUSHIONED_ACRYLIC', type: 'OUTDOOR', basePricePerHour: 550, weekendPeak: 700 },
        { name: 'Court 3 - Turf Academy Court', surface: 'SYNTHETIC_TURF', type: 'OUTDOOR', basePricePerHour: 400, weekendPeak: 500 },
      ],
    },
    {
      slug: 'the-foothills-club-panchkula',
      name: 'The Foothills Club Panchkula',
      hostEmail: 'simi@lakeclubdinkers.com',
      city: 'PANCHKULA',
      area: 'MDC Sector 4',
      address: 'Shivalik Hill View Enclave, MDC Sector 4, Panchkula 134107',
      description: 'Mountain-view sanctuary overlooking the scenic Shivalik range. Features elevated covered rooftop decks protected by timber trusses and UV-retractable shades, a zen garden terrace, and cold-pressed detox juices.',
      googleMapsUrl: 'https://maps.google.com/?q=30.7180,76.8480',
      latitude: 30.7180,
      longitude: 76.8480,
      hasLighting: true,
      hasEquipmentRental: true,
      hasParking: true,
      hasWashroom: true,
      hasDrinkingWater: true,
      contactPhone: '+919872054322',
      whatsappNumber: '919872054321',
      contactEmail: 'foothills@lakeclubdinkers.com',
      cancellationCutoffHours: 12,
      images: [
        { url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1200&q=80', isCover: true, displayOrder: 1 },
      ],
      courts: [
        { name: 'Court 1 - Shivalik Skyline Deck', surface: 'CUSHIONED_ACRYLIC', type: 'COVERED_ROOFTOP', basePricePerHour: 700, weekendPeak: 850 },
        { name: 'Court 2 - Valley View Covered Deck', surface: 'CUSHIONED_ACRYLIC', type: 'COVERED_ROOFTOP', basePricePerHour: 700, weekendPeak: 850 },
      ],
    },
    {
      slug: 'courtyard-zirakpur-sports-hub',
      name: 'CourtYard Zirakpur Sports Hub',
      hostEmail: 'vicky@baselinearena.com',
      city: 'ZIRAKPUR',
      area: 'VIP Road / Airport Ring Road',
      address: 'Sports Hub Lane, Behind Maya Garden City & Decathlon, VIP Road, Zirakpur 140603',
      description: 'Hyper-energetic suburban hub near Decathlon catering to young families, IT commuters, and apartment communities. Upbeat music, weekend social tournaments, and after-dinner friendly doubles until 23:00.',
      googleMapsUrl: 'https://maps.google.com/?q=30.6420,76.8180',
      latitude: 30.6420,
      longitude: 76.8180,
      hasLighting: true,
      hasEquipmentRental: true,
      hasParking: true,
      hasWashroom: true,
      hasDrinkingWater: true,
      contactPhone: '+919876544322',
      whatsappNumber: '919876544321',
      contactEmail: 'courtyard@baselinearena.com',
      cancellationCutoffHours: 4,
      images: [
        { url: 'https://images.unsplash.com/photo-1521537634581-0dced2fee2ef?auto=format&fit=crop&w=1200&q=80', isCover: true, displayOrder: 1 },
      ],
      courts: [
        { name: 'Court 1 - The Runway Court', surface: 'ACRYLIC_HARD', type: 'OUTDOOR', basePricePerHour: 500, weekendPeak: 650 },
        { name: 'Court 2 - Express Court', surface: 'ACRYLIC_HARD', type: 'OUTDOOR', basePricePerHour: 500, weekendPeak: 650 },
        { name: 'Court 3 - Neon Arena', surface: 'CONCRETE', type: 'OUTDOOR', basePricePerHour: 400, weekendPeak: 500 },
      ],
    },
  ];

  const seededCourts = [];

  for (const v of venueDefs) {
    const hostUser = hostsByEmail[v.hostEmail] || Object.values(hostsByEmail)[0];

    // Upsert Venue
    const venue = await prisma.venue.upsert({
      where: { slug: v.slug },
      update: {
        name: v.name,
        hostId: hostUser.id,
        city: v.city,
        area: v.area,
        address: v.address,
        description: v.description,
        googleMapsUrl: v.googleMapsUrl,
        latitude: v.latitude,
        longitude: v.longitude,
        hasLighting: v.hasLighting,
        hasEquipmentRental: v.hasEquipmentRental,
        hasParking: v.hasParking,
        hasWashroom: v.hasWashroom,
        hasDrinkingWater: v.hasDrinkingWater,
        contactPhone: v.contactPhone,
        whatsappNumber: v.whatsappNumber,
        contactEmail: v.contactEmail,
        cancellationCutoffHours: v.cancellationCutoffHours,
      },
      create: {
        name: v.name,
        slug: v.slug,
        hostId: hostUser.id,
        city: v.city,
        area: v.area,
        address: v.address,
        description: v.description,
        googleMapsUrl: v.googleMapsUrl,
        latitude: v.latitude,
        longitude: v.longitude,
        hasLighting: v.hasLighting,
        hasEquipmentRental: v.hasEquipmentRental,
        hasParking: v.hasParking,
        hasWashroom: v.hasWashroom,
        hasDrinkingWater: v.hasDrinkingWater,
        contactPhone: v.contactPhone,
        whatsappNumber: v.whatsappNumber,
        contactEmail: v.contactEmail,
        cancellationCutoffHours: v.cancellationCutoffHours,
      },
    });

    // Images
    for (const img of v.images) {
      const existingImg = await prisma.venueImage.findFirst({
        where: { venueId: venue.id, url: img.url },
      });
      if (!existingImg) {
        await prisma.venueImage.create({
          data: {
            venueId: venue.id,
            url: img.url,
            isCover: img.isCover,
            displayOrder: img.displayOrder,
          },
        });
      }
    }

    // Courts
    for (const c of v.courts) {
      let court = await prisma.court.findFirst({
        where: { venueId: venue.id, name: c.name },
      });

      if (!court) {
        court = await prisma.court.create({
          data: {
            venueId: venue.id,
            name: c.name,
            surface: c.surface,
            type: c.type,
            basePricePerHour: c.basePricePerHour,
          },
        });
      } else {
        court = await prisma.court.update({
          where: { id: court.id },
          data: {
            surface: c.surface,
            type: c.type,
            basePricePerHour: c.basePricePerHour,
          },
        });
      }

      seededCourts.push({
        court,
        venue,
        weekendPeak: c.weekendPeak,
      });
    }
  }

  console.log(`✓ Seeded ${venueDefs.length} Venues and ${seededCourts.length} Courts.\n`);

  // ─────────────────────────────────────────────
  // 3. SEED WEEKLY SCHEDULES & MATERIALIZE SLOTS
  // ─────────────────────────────────────────────
  console.log('⏰ Seeding Weekly Schedules and Materializing 7-Day Slot Inventory...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysOfWeek = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ];

  // Daily hours from 06:00 to 23:00 (17 1-hour slots)
  const slotHours = [];
  for (let h = 6; h < 23; h++) {
    const startStr = `${h.toString().padStart(2, '0')}:00`;
    const endStr = `${(h + 1).toString().padStart(2, '0')}:00`;
    slotHours.push({ startStr, endStr });
  }

  let totalSlotsMaterialized = 0;

  for (const item of seededCourts) {
    const court = item.court;

    // 1. Weekly Schedules for this court
    for (const day of daysOfWeek) {
      const isWeekend = day === 'SATURDAY' || day === 'SUNDAY';
      await prisma.schedule.upsert({
        where: {
          courtId_dayOfWeek: {
            courtId: court.id,
            dayOfWeek: day,
          },
        },
        update: {
          openTime: '06:00',
          closeTime: '23:00',
          slotDurationMinutes: 60,
          priceOverride: isWeekend ? item.weekendPeak : null,
        },
        create: {
          courtId: court.id,
          dayOfWeek: day,
          openTime: '06:00',
          closeTime: '23:00',
          slotDurationMinutes: 60,
          priceOverride: isWeekend ? item.weekendPeak : null,
        },
      });
    }

    // 2. Materialize 7 Days of Slots for this court
    const courtSlotsToInsert = [];

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const slotDate = addDays(today, dayOffset);
      const dayName = DAY_NAMES[slotDate.getDay()];
      const isWeekend = dayName === 'SATURDAY' || dayName === 'SUNDAY';
      const slotPrice = isWeekend ? item.weekendPeak : court.basePricePerHour;

      for (const sh of slotHours) {
        courtSlotsToInsert.push({
          courtId: court.id,
          date: slotDate,
          startTime: sh.startStr,
          endTime: sh.endStr,
          price: slotPrice,
          status: 'AVAILABLE',
        });
      }
    }

    // Batch insert with skipDuplicates
    const inserted = await prisma.slot.createMany({
      data: courtSlotsToInsert,
      skipDuplicates: true,
    });
    totalSlotsMaterialized += inserted.count;
  }

  console.log(`✓ Configured weekly schedules and materialized ${totalSlotsMaterialized} database slots across all 24 courts.\n`);

  // ─────────────────────────────────────────────
  // 4. SEED SAMPLE BOOKINGS, PAYMENTS & OPEN GAMES
  // ─────────────────────────────────────────────
  console.log('🏓 Seeding Confirmed Bookings, Payments, and Community Open Games...');

  const openGameScenarios = [
    {
      venueSlug: 'lake-club-dinkers-and-cafe',
      courtName: 'Court 1 - The Promenade Deck',
      creatorEmail: 'garry.sodhi@sodhicapital.in',
      confirmedPlayerEmails: ['aman.cheema88@gmail.com', 'dr.vmehra.ortho@gmail.com'],
      dayOffset: 1, // Tomorrow
      startTime: '07:00',
      title: 'Morning Dink & Lake Chai (3.0 – 3.5)',
      description: 'Brisk morning breeze by Sukhna Lake followed by hot adrak chai and sourdough toast at The Third Shot Cafe. Looking for one solid 3.0–3.5 player for relaxed, structured doubles. Focus strictly on sustained dinking patience, soft resets, and third-shot drops.',
      skillLevel: 'INTERMEDIATE',
    },
    {
      venueSlug: 'the-dinking-hub-sec-42',
      courtName: 'Court 1 - Stadium Centre Court',
      creatorEmail: 'rhea.kapoor.arch@gmail.com',
      confirmedPlayerEmails: ['tj.joshi.pec@gmail.com', 'navdeep.sandhu.tt@gmail.com'],
      dayOffset: 2,
      startTime: '20:00',
      title: 'Friday Night Under Lights — Competitive 4.0+ Fast Pace',
      description: 'High-octane competitive doubles under the 350-lux stadium floodlights. Fast kitchen firefights, aggressive roll volleys, Erne readiness, and tournament tempo. Bring Franklin X-40 or Dura Fast 40 yellow balls.',
      skillLevel: 'ADVANCED',
    },
    {
      venueSlug: 'the-foothills-club-panchkula',
      courtName: 'Court 2 - Valley View Covered Deck',
      creatorEmail: 'simrat.dhillon93@outlook.com',
      confirmedPlayerEmails: ['pooja.sehgal.ux@gmail.com'],
      dayOffset: 3,
      startTime: '08:00',
      title: 'Sunday Beginner Social & Technique Drill (2.0 – 2.5)',
      description: 'Friendly, zero-pressure morning hit for players transitioning from badminton/running or picking up a paddle for the first month! We drill serves and soft kitchen drops for 15 mins, then play rotating friendly doubles.',
      skillLevel: 'BEGINNER',
    },
    {
      venueSlug: 'tpc-mohali',
      courtName: 'Court 2 - Silicon Blue Court (AC)',
      creatorEmail: 'aman.cheema88@gmail.com',
      confirmedPlayerEmails: ['dr.vmehra.ortho@gmail.com', 'harleen.bawa.sports@gmail.com'],
      dayOffset: 1,
      startTime: '19:00',
      title: 'After-Work Techie Smash — Splitting Court Cost (3.0 – 3.5)',
      description: 'De-stress after sprint reviews and standup tickets! Fully air-conditioned indoor cushioned court right next to QuarkCity & Bestech Towers. Splitting the court cost equally at 4 seats.',
      skillLevel: 'INTERMEDIATE',
    },
    {
      venueSlug: 'courtyard-zirakpur-sports-hub',
      courtName: 'Court 1 - The Runway Court',
      creatorEmail: 'harleen.bawa.sports@gmail.com',
      confirmedPlayerEmails: ['arjun@drinkbotanics.in'],
      dayOffset: 4,
      startTime: '17:00',
      title: 'Zirakpur Sunset Sizzler — Open Skill Doubles (2.5 – 3.5)',
      description: 'Golden hour games just off VIP Road! Open to anyone who knows basic scoring and can keep a 6-ball rally alive. Upbeat playlist on court speakers, water breaks, and King of the Court rotations.',
      skillLevel: 'OPEN',
    },
    {
      venueSlug: 'jlpl-smash-zone-arena',
      courtName: 'Court 1 - Championship Court A',
      creatorEmail: 'tj.joshi.pec@gmail.com',
      confirmedPlayerEmails: ['rhea.kapoor.arch@gmail.com', 'navdeep.sandhu.tt@gmail.com'],
      dayOffset: 5,
      startTime: '20:00',
      title: 'Midweek Power Hour — Advanced 4.0+ Fast Hands',
      description: 'Need one quick-handed 4.0+ player to round out an aggressive 60-min doubles session. Fast NVZ punch exchanges, ATP defense, and deep drive returns. Court has 4K overhead cameras.',
      skillLevel: 'ADVANCED',
    },
    {
      venueSlug: 'baseline-arena-panchkula',
      courtName: 'Court 1 - Tau Devi Lal North Court',
      creatorEmail: 'dr.vmehra.ortho@gmail.com',
      confirmedPlayerEmails: ['garry.sodhi@sodhicapital.in', 'pooja.sehgal.ux@gmail.com'],
      dayOffset: 2,
      startTime: '07:00',
      title: 'Panchkula Morning Masters (Intermediate 3.0+)',
      description: 'Disciplined, low-impact morning doubles before clinic and office hours. Focus on placement, cross-court dinking angles, and consistent depth over brute power. Great community of regulars.',
      skillLevel: 'INTERMEDIATE',
    },
    {
      venueSlug: 'sector-10-heritage-courts',
      courtName: 'Court 1 - Leisure Valley Court',
      creatorEmail: 'arjun@drinkbotanics.in',
      confirmedPlayerEmails: ['aman.cheema88@gmail.com'],
      dayOffset: 6,
      startTime: '18:00',
      title: 'Weekend King of the Court Scrimmage (Open Skill Level)',
      description: 'Classic Sector 10 weekend vibe under the green trees! King of the Court format: 11-point games, win by 1, winners stay and split, losers rotate. Energetic crowd and music.',
      skillLevel: 'OPEN',
    },
  ];

  let gamesCreated = 0;

  for (let idx = 0; idx < openGameScenarios.length; idx++) {
    const sc = openGameScenarios[idx];
    const creator = playersByEmail[sc.creatorEmail];
    if (!creator) continue;

    // Find venue and court
    const venue = await prisma.venue.findUnique({ where: { slug: sc.venueSlug } });
    if (!venue) continue;

    const court = await prisma.court.findFirst({
      where: { venueId: venue.id, name: sc.courtName },
    });
    if (!court) continue;

    const gameDate = addDays(today, sc.dayOffset);

    // Find the slot for this court, date, startTime
    const slot = await prisma.slot.findFirst({
      where: {
        courtId: court.id,
        date: gameDate,
        startTime: sc.startTime,
      },
    });

    if (!slot) continue;

    // 1. Lock slot to BOOKED
    await prisma.slot.update({
      where: { id: slot.id },
      data: { status: 'BOOKED', heldBy: creator.id },
    });

    // 2. Create Confirmed Booking
    const refCode = `DNK-${formatDate(gameDate).replace(/-/g, '').slice(2)}-${(1000 + idx).toString()}`;
    const booking = await prisma.booking.upsert({
      where: { bookingReference: refCode },
      update: {
        status: 'CONFIRMED',
        totalPrice: slot.price,
      },
      create: {
        bookingReference: refCode,
        userId: creator.id,
        slotId: slot.id,
        courtId: court.id,
        venueId: venue.id,
        status: 'CONFIRMED',
        totalPrice: slot.price,
        cancellationCutoff: new Date(gameDate.getTime() - venue.cancellationCutoffHours * 3600000),
      },
    });

    // 3. Create Confirmed Payment
    const payRef = `PAY-${formatDate(gameDate).replace(/-/g, '').slice(2)}-${(2000 + idx).toString()}`;
    await prisma.payment.upsert({
      where: { paymentReference: payRef },
      update: { status: 'CAPTURED' },
      create: {
        paymentReference: payRef,
        bookingId: booking.id,
        userId: creator.id,
        provider: 'MOCK',
        orderId: `order_mock_${1000 + idx}`,
        paymentId: `pay_mock_${1000 + idx}`,
        amount: slot.price,
        currency: 'INR',
        status: 'CAPTURED',
      },
    });

    // 4. Create Open Game
    const confirmedPlayers = [creator];
    for (const email of sc.confirmedPlayerEmails) {
      if (playersByEmail[email]) {
        confirmedPlayers.push(playersByEmail[email]);
      }
    }

    const pricePerSeat = Math.round(slot.price / 4);

    const game = await prisma.game.upsert({
      where: { bookingId: booking.id },
      update: {
        title: sc.title,
        description: sc.description,
        skillLevel: sc.skillLevel,
        seatsTotal: 4,
        seatsTaken: confirmedPlayers.length,
        pricePerSeat,
        status: confirmedPlayers.length >= 4 ? 'FULL' : 'OPEN',
      },
      create: {
        bookingId: booking.id,
        creatorId: creator.id,
        courtId: court.id,
        venueId: venue.id,
        title: sc.title,
        description: sc.description,
        skillLevel: sc.skillLevel,
        seatsTotal: 4,
        seatsTaken: confirmedPlayers.length,
        pricePerSeat,
        status: 'OPEN',
      },
    });

    // 5. Create Seats (Seat 1 = Creator, Seat 2..N = Other players)
    for (let seatIdx = 0; seatIdx < confirmedPlayers.length; seatIdx++) {
      const player = confirmedPlayers[seatIdx];
      const seatNum = seatIdx + 1;

      await prisma.gameSeat.upsert({
        where: {
          gameId_userId: {
            gameId: game.id,
            userId: player.id,
          },
        },
        update: {
          seatNumber: seatNum,
          price: pricePerSeat,
          status: 'CONFIRMED',
        },
        create: {
          gameId: game.id,
          userId: player.id,
          seatNumber: seatNum,
          price: pricePerSeat,
          status: 'CONFIRMED',
        },
      });
    }

    gamesCreated++;
  }

  console.log(`✓ Seeded ${gamesCreated} realistic Open Games with confirmed payments & seat splits.\n`);

  console.log('═════════════════════════════════════════════════════════════════');
  console.log('🎉 DinkUp Backend Database Seeding Complete!');
  console.log(`   • Users in DB:    ${await prisma.user.count()}`);
  console.log(`   • Venues in DB:   ${await prisma.venue.count()}`);
  console.log(`   • Courts in DB:   ${await prisma.court.count()}`);
  console.log(`   • Schedules:      ${await prisma.schedule.count()}`);
  console.log(`   • Slots in DB:    ${await prisma.slot.count()}`);
  console.log(`   • Bookings in DB: ${await prisma.booking.count()}`);
  console.log(`   • Payments in DB: ${await prisma.payment.count()}`);
  console.log(`   • Open Games:     ${await prisma.game.count()}`);
  console.log(`   • Seats Claimed:  ${await prisma.gameSeat.count()}`);
  console.log('═════════════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
