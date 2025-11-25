const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const chalk = require('chalk');
const readline = require('readline');

// CONFIGURATION
const CONFIG = {
    studentsFile: 'students.txt',
    receiptsDir: 'receipts',
    outputFile: 'sukses.txt',
    maxConcurrent: 100,
    batchSize: 100,
    timeout: 300000,
    uploadTimeout: 30000,
    maxRetries: 0,
    retryDelay: 3000,
    batchDelay: 1000,
    verificationTimeout: 10,
    
    selectedCountry: null,
    countryConfig: null,
    targetLinks: 0,
    targetReached: false,
    
    autoDeleteProcessed: true,
    retryAllFilesOnFailure: true
};

// COUNTRY CONFIGURATIONS - ALL 24 COUNTRIES WITH SAME PROGRAM ID
const COUNTRIES = {
    'US': {
        name: 'United States',
        code: 'us',
        locale: 'en-us',
        currency: 'USD',
        flag: '🇺🇸',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=us&locale=en-us',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_us.json'
    },
    'CA': {
        name: 'Canada',
        code: 'ca',
        locale: 'en-ca',
        currency: 'CAD',
        flag: '🇨🇦',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=ca&locale=en-ca',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_ca.json'
    },
    'GB': {
        name: 'United Kingdom',
        code: 'gb',
        locale: 'en-gb',
        currency: 'GBP',
        flag: '🇬🇧',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=gb&locale=en-gb',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_gb.json'
    },
    'IN': {
        name: 'India',
        code: 'in',
        locale: 'en-in',
        currency: 'INR',
        flag: '🇮🇳',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=in&locale=en-in',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_in.json'
    },
    'ID': {
        name: 'Indonesia',
        code: 'id',
        locale: 'id-id',
        currency: 'IDR',
        flag: '🇮🇩',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=id&locale=id-id',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_id.json'
    },
    'AU': {
        name: 'Australia',
        code: 'au',
        locale: 'en-au',
        currency: 'AUD',
        flag: '🇦🇺',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=au&locale=en-au',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_au.json'
    },
    'DE': {
        name: 'Germany',
        code: 'de',
        locale: 'de-de',
        currency: 'EUR',
        flag: '🇩🇪',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=de&locale=de-de',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_de.json'
    },
    'FR': {
        name: 'France',
        code: 'fr',
        locale: 'fr-fr',
        currency: 'EUR',
        flag: '🇫🇷',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=fr&locale=fr-fr',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_fr.json'
    },
    'ES': {
        name: 'Spain',
        code: 'es',
        locale: 'es-es',
        currency: 'EUR',
        flag: '🇪🇸',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=es&locale=es-es',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_es.json'
    },
    'IT': {
        name: 'Italy',
        code: 'it',
        locale: 'it-it',
        currency: 'EUR',
        flag: '🇮🇹',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=it&locale=it-it',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_it.json'
    },
    'BR': {
        name: 'Brazil',
        code: 'br',
        locale: 'pt-br',
        currency: 'BRL',
        flag: '🇧🇷',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=br&locale=pt-br',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_br.json'
    },
    'MX': {
        name: 'Mexico',
        code: 'mx',
        locale: 'es-mx',
        currency: 'MXN',
        flag: '🇲🇽',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=mx&locale=es-mx',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_mx.json'
    },
    'NL': {
        name: 'Netherlands',
        code: 'nl',
        locale: 'nl-nl',
        currency: 'EUR',
        flag: '🇳🇱',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=nl&locale=nl-nl',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_nl.json'
    },
    'SE': {
        name: 'Sweden',
        code: 'se',
        locale: 'sv-se',
        currency: 'SEK',
        flag: '🇸🇪',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=se&locale=sv-se',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_se.json'
    },
    'NO': {
        name: 'Norway',
        code: 'no',
        locale: 'no-no',
        currency: 'NOK',
        flag: '🇳🇴',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=no&locale=no-no',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_no.json'
    },
    'DK': {
        name: 'Denmark',
        code: 'dk',
        locale: 'da-dk',
        currency: 'DKK',
        flag: '🇩🇰',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=dk&locale=da-dk',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_dk.json'
    },
    'JP': {
        name: 'Japan',
        code: 'jp',
        locale: 'ja-jp',
        currency: 'JPY',
        flag: '🇯🇵',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=jp&locale=ja-jp',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_jp.json'
    },
    'KR': {
        name: 'South Korea',
        code: 'kr',
        locale: 'ko-kr',
        currency: 'KRW',
        flag: '🇰🇷',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=kr&locale=ko-kr',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_kr.json'
    },
    'SG': {
        name: 'Singapore',
        code: 'sg',
        locale: 'en-sg',
        currency: 'SGD',
        flag: '🇸🇬',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=sg&locale=en-sg',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_sg.json'
    },
    'NZ': {
        name: 'New Zealand',
        code: 'nz',
        locale: 'en-nz',
        currency: 'NZD',
        flag: '🇳🇿',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=nz&locale=en-nz',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_nz.json'
    },
    'ZA': {
        name: 'South Africa',
        code: 'za',
        locale: 'en-za',
        currency: 'ZAR',
        flag: '🇿🇦',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=za&locale=en-za',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_za.json'
    },
    'CN': {
        name: 'China',
        code: 'cn',
        locale: 'zh-cn',
        currency: 'CNY',
        flag: '🇨🇳',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=cn&locale=zh-cn',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_cn.json'
    },
    'AE': {
        name: 'United Arab Emirates',
        code: 'ae',
        locale: 'en-ae',
        currency: 'AED',
        flag: '🇦🇪',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=ae&locale=en-ae',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_ae.json'
    },
    'PH': {
        name: 'Philippines',
        code: 'ph',
        locale: 'en-ph',
        currency: 'PHP',
        flag: '🇵🇭',
        domains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'],
        programId: '63fd266996552d469aea40e1',
        sheeridUrl: 'https://services.sheerid.com/verify/63fd266996552d469aea40e1/?country=ph&locale=en-ph',
        submitEndpoint: 'https://services.sheerid.com/rest/v2/verification/program/63fd266996552d469aea40e1/step/collectStudentPersonalInfo',
        uploadEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/step/docUpload',
        statusEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}',
        redirectEndpoint: 'https://services.sheerid.com/rest/v2/verification/{verificationId}/redirect',
        finalLinkFormat: 'https://www.spotify.com/student/apply/sheerid-program?verificationId={verificationId}',
        collegesFile: 'sheerid_ph.json'
    }
};

// USER AGENTS
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

// ASYNC READLINE HELPER
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// COUNTRY SELECTOR
async function selectCountry() {
    console.log(chalk.cyan('\n🌍 SELECT COUNTRY FOR SPOTIFY VERIFICATION:'));
    console.log(chalk.yellow('1 . United States        (US) | 2 . Canada               (CA)'));
    console.log(chalk.yellow('3 . United Kingdom       (GB) | 4 . India                (IN)'));
    console.log(chalk.yellow('5 . Indonesia            (ID) | 6 . Australia            (AU)'));
    console.log(chalk.yellow('7 . Germany              (DE) | 8 . France               (FR)'));
    console.log(chalk.yellow('9 . Spain                (ES) | 10. Italy                (IT)'));
    console.log(chalk.yellow('11. Brazil               (BR) | 12. Mexico               (MX)'));
    console.log(chalk.yellow('13. Netherlands          (NL) | 14. Sweden               (SE)'));
    console.log(chalk.yellow('15. Norway               (NO) | 16. Denmark              (DK)'));
    console.log(chalk.yellow('17. Japan                (JP) | 18. South Korea          (KR)'));
    console.log(chalk.yellow('19. Singapore            (SG) | 20. New Zealand          (NZ)'));
    console.log(chalk.yellow('21. South Africa         (ZA) | 22. China                (CN)'));
    console.log(chalk.yellow('23. UAE                  (AE) | 24. Philippines          (PH)'));
    
    const answer = await askQuestion(chalk.blue('\nEnter your choice (1-24 or country code): '));
    const choice = answer.trim().toUpperCase();
    
    const countryMap = {
        '1': 'US', '2': 'CA', '3': 'GB', '4': 'IN', '5': 'ID', '6': 'AU',
        '7': 'DE', '8': 'FR', '9': 'ES', '10': 'IT', '11': 'BR', '12': 'MX',
        '13': 'NL', '14': 'SE', '15': 'NO', '16': 'DK', '17': 'JP', '18': 'KR',
        '19': 'SG', '20': 'NZ', '21': 'ZA', '22': 'CN', '23': 'AE', '24': 'PH'
    };
    
    const selectedCode = countryMap[choice] || choice;
    
    if (COUNTRIES[selectedCode]) {
        return selectedCode;
    } else {
        console.log(chalk.red('❌ Invalid choice. Defaulting to India (IN)'));
        return 'IN';
    }
}

// TARGET LINKS SELECTOR
async function askTargetLinks(maxPossible) {
    console.log(chalk.cyan('\n🎯 SET YOUR TARGET:'));
    console.log(chalk.yellow(`   Maximum possible links: ${maxPossible}`));
    console.log(chalk.gray('   Enter 0 or "all" to process all students'));
    console.log(chalk.gray('   Enter a number to set a target (e.g., 100)'));
    
    const answer = await askQuestion(chalk.blue('\n🎯 How many links do you want to generate? '));
    const input = answer.trim().toLowerCase();
    
    if (input === '0' || input === 'all' || input === '') {
        console.log(chalk.green(`✅ Target set: Process ALL ${maxPossible} students`));
        return maxPossible;
    }
    
    const target = parseInt(input);
    if (isNaN(target) || target < 1) {
        console.log(chalk.yellow(`⚠️ Invalid input. Setting target to ALL (${maxPossible})`));
        return maxPossible;
    }
    
    if (target > maxPossible) {
        console.log(chalk.yellow(`⚠️ Target ${target} exceeds maximum ${maxPossible}. Setting to ${maxPossible}`));
        return maxPossible;
    }
    
    console.log(chalk.green(`✅ Target set: Generate ${target} links`));
    return target;
}

// STATISTICS TRACKER
class StatisticsTracker {
    constructor() {
        this.successTypes = {
            instant_exact: 0,
            already_success_exact: 0,
            upload_exact: 0,
            upload_sso: 0,
            sso_redirect: 0
        };
        
        this.collegeStats = new Map();
        this.fileStats = {
            totalFiles: 0,
            successfulFiles: 0,
            rejectedFiles: 0,
            fileTypes: {}
        };
        
        this.uploadStats = {
            firstAttemptSuccess: 0,
            secondAttemptSuccess: 0,
            thirdPlusAttemptSuccess: 0,
            allAttemptsFailed: 0
        };
        
        this.timeStats = {
            startTime: Date.now(),
            endTime: null,
            linkTimes: []
        };
        
        this.processingStats = {
            noReceipt: 0,
            noExactMatch: 0,
            invalidCollege: 0,
            initFailed: 0,
            formFailed: 0,
            noFiles: 0
        };
    }
    
    recordSuccess(result) {
        if (result.type) {
            this.successTypes[result.type] = (this.successTypes[result.type] || 0) + 1;
        }
        
        if (result.uploadAttempt) {
            if (result.uploadAttempt === 1) {
                this.uploadStats.firstAttemptSuccess++;
            } else if (result.uploadAttempt === 2) {
                this.uploadStats.secondAttemptSuccess++;
            } else {
                this.uploadStats.thirdPlusAttemptSuccess++;
            }
        }
        
        this.timeStats.linkTimes.push({
            time: Date.now() - this.timeStats.startTime,
            student: result.student.studentId
        });
    }
    
    recordCollegeAttempt(collegeId, collegeName, success) {
        if (!this.collegeStats.has(collegeId)) {
            this.collegeStats.set(collegeId, {
                name: collegeName,
                success: 0,
                failed: 0
            });
        }
        
        const stats = this.collegeStats.get(collegeId);
        if (success) {
            stats.success++;
        } else {
            stats.failed++;
        }
    }
    
    recordFailureReason(reason) {
        if (this.processingStats[reason] !== undefined) {
            this.processingStats[reason]++;
        }
    }
    
    finalize() {
        this.timeStats.endTime = Date.now();
    }
    
    getDetailedAnalysis() {
        const totalTime = (this.timeStats.endTime - this.timeStats.startTime) / 1000;
        const totalSuccess = Object.values(this.successTypes).reduce((a, b) => a + b, 0);
        
        const avgTimePerLink = this.timeStats.linkTimes.length > 0 
            ? (totalTime / this.timeStats.linkTimes.length).toFixed(2)
            : '0';
        
        const topColleges = Array.from(this.collegeStats.entries())
            .filter(([_, stats]) => stats.success > 0)
            .sort((a, b) => b[1].success - a[1].success)
            .slice(0, 10);
        
        return {
            totalTime,
            totalSuccess,
            avgTimePerLink,
            successTypes: this.successTypes,
            topColleges,
            uploadStats: this.uploadStats,
            processingStats: this.processingStats,
            linkTimes: this.timeStats.linkTimes
        };
    }
}

// EXACT JSON COLLEGE MATCHER
class ExactJsonCollegeMatcher {
    constructor(countryConfig) {
        this.countryConfig = countryConfig;
        this.studentCollegeMap = new Map();
        this.collegesMap = new Map();
        this.invalidCollegeIds = new Set();
        this.workingCollegeIds = new Set();
        this.receiptPattern = /^(\d+)_(\d+)\.(png|jpg|jpeg|pdf|webp)$/i;
        this.successCount = 0;
        this.failedCount = 0;
        this.exactMatchCount = 0;
        this.noMatchCount = 0;
        this.uploadRetryCount = 0;
    }
    
    analyzeReceipts() {
        if (!fs.existsSync(CONFIG.receiptsDir)) {
            console.log(chalk.red(`❌ ${CONFIG.receiptsDir} directory not found`));
            return false;
        }
        
        const files = fs.readdirSync(CONFIG.receiptsDir);
        const receiptFiles = files.filter(file => this.receiptPattern.test(file));
        
        if (receiptFiles.length === 0) {
            console.log(chalk.red(`❌ No receipt files found`));
            return false;
        }
        
        receiptFiles.forEach(file => {
            const match = file.match(this.receiptPattern);
            if (match) {
                const studentId = match[1];
                const collegeId = parseInt(match[2]);
                this.studentCollegeMap.set(studentId, collegeId);
            }
        });
        
        console.log(chalk.green(`📄 Mapped ${this.studentCollegeMap.size} students from receipt files`));
        return true;
    }
    
    loadColleges() {
        try {
            const collegesFile = this.countryConfig.collegesFile;
            
            if (!fs.existsSync(collegesFile)) {
                console.log(chalk.red(`❌ ${collegesFile} not found`));
                return false;
            }
            
            console.log(chalk.blue(`📚 Loading colleges from ${collegesFile} for ${this.countryConfig.flag} ${this.countryConfig.name}...`));
            
            const data = JSON.parse(fs.readFileSync(collegesFile, 'utf-8'));
            const colleges = data.filter(c => c.name && c.id);
            
            colleges.forEach(college => {
                this.collegesMap.set(college.id, college);
            });
            
            console.log(chalk.green(`📚 Loaded ${colleges.length} colleges from ${collegesFile} ${this.countryConfig.flag}`));
            
            console.log(chalk.cyan(`📋 Sample colleges from ${collegesFile}:`));
            colleges.slice(0, 5).forEach(college => {
                console.log(chalk.gray(`   • ID ${college.id}: ${college.name.substring(0, 60)}...`));
            });
            
            return true;
        } catch (error) {
            console.log(chalk.red(`❌ Error loading ${this.countryConfig.collegesFile}: ${error.message}`));
            return false;
        }
    }
    
    getExactCollegeForStudent(studentId) {
        const receiptCollegeId = this.studentCollegeMap.get(studentId);
        
        if (!receiptCollegeId) {
            console.log(chalk.red(`❌ NO RECEIPT: Student ${studentId} has no receipt file`));
            this.noMatchCount++;
            return null;
        }
        
        if (this.invalidCollegeIds.has(receiptCollegeId)) {
            console.log(chalk.red(`❌ INVALID COLLEGE: Student ${studentId} → College ID ${receiptCollegeId} marked as invalid`));
            this.noMatchCount++;
            return null;
        }
        
        if (this.collegesMap.has(receiptCollegeId)) {
            const college = this.collegesMap.get(receiptCollegeId);
            console.log(chalk.green(`✅ EXACT MATCH: Student ${studentId} → College ID ${receiptCollegeId} → ${college.name.substring(0, 50)}...`));
            this.exactMatchCount++;
            return college;
        }
        
        console.log(chalk.red(`❌ NOT FOUND: Student ${studentId} → College ID ${receiptCollegeId} not in ${this.countryConfig.collegesFile}`));
        this.noMatchCount++;
        return null;
    }
    
    markCollegeAsWorking(collegeId) {
        this.workingCollegeIds.add(collegeId);
        console.log(chalk.green(`✅ CONFIRMED WORKING: College ID ${collegeId}`));
    }
    
    markCollegeAsInvalid(collegeId) {
        this.invalidCollegeIds.add(collegeId);
        console.log(chalk.red(`❌ MARKED INVALID: College ID ${collegeId}`));
    }
    
    hasReceiptForStudent(studentId) {
        return this.studentCollegeMap.has(studentId);
    }
    
    getReceiptCollegeId(studentId) {
        return this.studentCollegeMap.get(studentId);
    }
    
    isCollegeInJson(collegeId) {
        return this.collegesMap.has(collegeId);
    }
    
    getCollegeName(collegeId) {
        return this.collegesMap.get(collegeId)?.name || 'Unknown';
    }
    
    incrementUploadRetry() {
        this.uploadRetryCount++;
    }
    
    addSuccess() { this.successCount++; }
    addFailure() { this.failedCount++; }
    
    getStats() {
        const total = this.successCount + this.failedCount;
        const successRate = total > 0 ? ((this.successCount / total) * 100).toFixed(1) : '0.0';
        const exactMatchRate = this.studentCollegeMap.size > 0 ? ((this.exactMatchCount / this.studentCollegeMap.size) * 100).toFixed(1) : '0.0';
        
        return {
            success: this.successCount,
            failed: this.failedCount,
            total: total,
            successRate: successRate,
            exactMatches: this.exactMatchCount,
            noMatches: this.noMatchCount,
            exactMatchRate: exactMatchRate,
            invalidColleges: this.invalidCollegeIds.size,
            workingColleges: this.workingCollegeIds.size,
            totalColleges: this.collegesMap.size,
            studentsWithReceipts: this.studentCollegeMap.size,
            uploadRetries: this.uploadRetryCount
        };
    }
}

// IMMEDIATE DELETE MANAGER
class ImmediateDeleteManager {
    constructor() {
        this.processedStudents = new Set();
        this.deletedFiles = [];
    }
    
    deleteStudentImmediately(studentId, reason = 'processed') {
        try {
            if (fs.existsSync(CONFIG.receiptsDir)) {
                const files = fs.readdirSync(CONFIG.receiptsDir);
                const studentFiles = files.filter(file => file.startsWith(studentId + '_'));
                
                studentFiles.forEach(file => {
                    const filePath = path.join(CONFIG.receiptsDir, file);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        this.deletedFiles.push(file);
                        console.log(chalk.gray(`🗑️ DELETED: ${file} (${reason})`));
                    }
                });
            }
            
            this.removeFromStudentsFile(studentId);
            this.processedStudents.add(studentId);
            
        } catch (error) {
            console.log(chalk.yellow(`⚠️ Delete error for ${studentId}: ${error.message}`));
        }
    }
    
    removeFromStudentsFile(studentId) {
        try {
            if (!fs.existsSync(CONFIG.studentsFile)) return;
            
            const content = fs.readFileSync(CONFIG.studentsFile, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            
            const updatedLines = lines.filter(line => {
                const parts = line.split('|');
                if (parts.length < 2) return true;
                const lineStudentId = parts[1].trim();
                return lineStudentId !== studentId;
            });
            
            fs.writeFileSync(CONFIG.studentsFile, updatedLines.join('\n') + '\n');
            console.log(chalk.yellow(`📝 REMOVED from students.txt: ${studentId}`));
            
        } catch (error) {
            console.log(chalk.yellow(`⚠️ Failed to update students.txt: ${error.message}`));
        }
    }
    
    markStudentSuccess(studentId) {
        this.deleteStudentImmediately(studentId, 'SUCCESS');
    }
    
    markStudentFailed(studentId) {
        this.deleteStudentImmediately(studentId, 'FAILED');
    }
    
    markStudentRejected(studentId) {
        this.deleteStudentImmediately(studentId, 'REJECTED');
    }
    
    markStudentNoMatch(studentId) {
        this.deleteStudentImmediately(studentId, 'NO_EXACT_MATCH');
    }
}

// VERIFICATION SESSION - FIXED SSO HANDLING
class VerificationSession {
    constructor(id, countryConfig) {
        this.id = id;
        this.countryConfig = countryConfig;
        this.cookieJar = new tough.CookieJar();
        this.userAgent = this.getRandomUserAgent();
        this.verificationId = null;
        this.client = this.createClient();
        this.requestCount = 0;
        this.currentStep = 'init';
        this.submittedCollegeId = null;
        this.uploadAttempts = [];
    }
    
    createClient() {
        const config = {
            jar: this.cookieJar,
            timeout: CONFIG.timeout,
            maxRedirects: 3,
            validateStatus: (status) => status < 500,
            headers: {
                'User-Agent': this.userAgent,
                'Accept': 'application/json, text/html, application/xhtml+xml, */*',
                'Accept-Language': `${this.countryConfig.locale},en;q=0.9`,
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'DNT': '1',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'X-Country': this.countryConfig.code.toUpperCase(),
                'X-Locale': this.countryConfig.locale
            }
        };
        
        return wrapper(axios.create(config));
    }
    
    getRandomUserAgent() {
        return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    }
    
    async init() {
        try {
            console.log(`[${this.id}] 🚀 [${this.countryConfig.flag}] Initializing session...`);
            
            const delay = Math.floor(Math.random() * 1000) + 500;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            const response = await this.client.get(this.countryConfig.sheeridUrl);
            
            this.requestCount++;
            this.currentStep = 'initialized';
            console.log(`[${this.id}] ✅ [${this.countryConfig.flag}] Session initialized`);
            return response.status === 200;
        } catch (error) {
            console.log(`[${this.id}] ❌ [${this.countryConfig.flag}] Init failed: ${error.message}`);
            return false;
        }
    }
    
    async submitPersonalInfo(student, dob, college) {
        try {
            console.log(`[${this.id}] 📝 [${this.countryConfig.flag}] Submitting with college ID ${college.id}: ${college.name.substring(0, 40)}...`);
            
            this.submittedCollegeId = college.id;
            
            const birthDate = `${dob.year}-${dob.month.toString().padStart(2, '0')}-${dob.day.toString().padStart(2, '0')}`;
            
            const data = {
                firstName: student.firstName,
                lastName: student.lastName,
                email: student.email,
                birthDate: birthDate,
                organization: {
                    id: college.id,
                    name: college.name
                },
                country: this.countryConfig.code.toUpperCase(),
                locale: this.countryConfig.locale
            };
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const response = await this.client.post(this.countryConfig.submitEndpoint, data, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': this.countryConfig.sheeridUrl,
                    'Origin': 'https://services.sheerid.com'
                }
            });
            
            this.requestCount++;
            
            if (response.data?.verificationId) {
                this.verificationId = response.data.verificationId;
                this.currentStep = response.data.currentStep || 'collectStudentPersonalInfo';
            } else {
                this.verificationId = this.generateVerificationId();
                this.currentStep = 'collectStudentPersonalInfo';
            }
            
            console.log(`[${this.id}] 🔑 [${this.countryConfig.flag}] Verification ID: ${this.verificationId}`);
            console.log(`[${this.id}] 📍 [${this.countryConfig.flag}] Step after submission: ${this.currentStep}`);
            
            return this.currentStep;
        } catch (error) {
            console.log(`[${this.id}] ❌ [${this.countryConfig.flag}] Form submission failed: ${error.message}`);
            return 'error';
        }
    }
    
    generateVerificationId() {
        const timestamp = Date.now().toString(16);
        const random = Math.random().toString(16).substr(2, 12);
        return (timestamp + random).substr(0, 24);
    }
    
    // ✅ FIXED: PROPER SSO HANDLING
    async waitForCorrectStep(maxWait = 6, collegeMatcher) {
        if (!this.verificationId) return 'error';
        
        console.log(`[${this.id}] ⏳ [${this.countryConfig.flag}] Checking step progression...`);
        
        for (let i = 0; i < maxWait; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
                const statusUrl = this.countryConfig.statusEndpoint.replace('{verificationId}', this.verificationId);
                const response = await this.client.get(statusUrl, {
                    headers: {
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Referer': this.countryConfig.sheeridUrl
                    }
                });
                
                const data = response.data;
                this.currentStep = data.currentStep;
                
                console.log(`[${this.id}] 🔍 [${this.countryConfig.flag}] Step check ${i+1}/${maxWait}: ${this.currentStep}`);
                
                if (this.currentStep === 'success') {
                    console.log(`[${this.id}] 🎉 [${this.countryConfig.flag}] Already SUCCESS!`);
                    if (collegeMatcher && this.submittedCollegeId) {
                        collegeMatcher.markCollegeAsWorking(this.submittedCollegeId);
                    }
                    return 'success';
                }
                
                if (this.currentStep === 'docUpload') {
                    console.log(`[${this.id}] ✅ [${this.countryConfig.flag}] Ready for document upload!`);
                    if (collegeMatcher && this.submittedCollegeId) {
                        collegeMatcher.markCollegeAsWorking(this.submittedCollegeId);
                    }
                    return 'docUpload';
                }
                
                // ✅ FIXED: Handle SSO colleges properly - don't mark as invalid
                if (this.currentStep === 'sso') {
                    console.log(`[${this.id}] 🔐 [${this.countryConfig.flag}] SSO COLLEGE detected - Will attempt upload anyway`);
                    // Don't mark SSO colleges as invalid - they're valid but require different handling
                    return 'sso'; // Return 'sso' to proceed with upload attempts
                }
                
                if (this.currentStep === 'error' || (data.errorIds && data.errorIds.length > 0)) {
                    console.log(`[${this.id}] ❌ [${this.countryConfig.flag}] Verification error: ${JSON.stringify(data.errorIds || [])}`);
                    if (collegeMatcher && this.submittedCollegeId) {
                        collegeMatcher.markCollegeAsInvalid(this.submittedCollegeId);
                    }
                    return 'error';
                }
                
                if (this.currentStep === 'collectStudentPersonalInfo' && i >= 4) {
                    console.log(`[${this.id}] ❌ [${this.countryConfig.flag}] STUCK at collectStudentPersonalInfo - INVALID COLLEGE ID ${this.submittedCollegeId}`);
                    if (collegeMatcher && this.submittedCollegeId) {
                        collegeMatcher.markCollegeAsInvalid(this.submittedCollegeId);
                    }
                    return 'invalid_college';
                }
                
            } catch (error) {
                console.log(`[${this.id}] ⚠️ [${this.countryConfig.flag}] Step check error: ${error.message}`);
                continue;
            }
        }
        
        console.log(`[${this.id}] ⏰ [${this.countryConfig.flag}] TIMEOUT reached - Final step: ${this.currentStep}`);
        
        // ✅ FIXED: Don't mark SSO colleges as invalid on timeout
        if (this.currentStep === 'sso') {
            console.log(`[${this.id}] 🔐 [${this.countryConfig.flag}] TIMEOUT but SSO detected - Will attempt upload`);
            return 'sso';
        }
        
        if (collegeMatcher && this.submittedCollegeId) {
            collegeMatcher.markCollegeAsInvalid(this.submittedCollegeId);
        }
        return 'invalid_college';
    }
    
    async uploadDocument(filePath, attemptNumber) {
        if (!filePath || !fs.existsSync(filePath)) {
            return { success: false, reason: 'No file' };
        }
        
        try {
            console.log(`[${this.id}] 📤 [${this.countryConfig.flag}] Upload attempt ${attemptNumber}: ${path.basename(filePath)}`);
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const formData = new FormData();
            const fileName = path.basename(filePath);
            const fileStats = fs.statSync(filePath);
            
            if (fileStats.size > 10 * 1024 * 1024) {
                return { success: false, reason: 'File too large' };
            }
            
            formData.append('file', fs.createReadStream(filePath), {
                filename: fileName,
                contentType: this.getContentType(fileName),
                knownLength: fileStats.size
            });
            
            const uploadUrl = this.countryConfig.uploadEndpoint.replace('{verificationId}', this.verificationId);
            
            const response = await this.client.post(uploadUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': this.countryConfig.sheeridUrl,
                    'Origin': 'https://services.sheerid.com',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: CONFIG.uploadTimeout
            });
            
            const uploadResult = {
                success: response.status === 200,
                attemptNumber: attemptNumber,
                fileName: fileName,
                fileSize: fileStats.size,
                status: response.status,
                timestamp: new Date().toISOString()
            };
            
            this.uploadAttempts.push(uploadResult);
            
            console.log(`[${this.id}] ${response.status === 200 ? '✅' : '❌'} [${this.countryConfig.flag}] Upload attempt ${attemptNumber} ${response.status === 200 ? 'SUCCESS' : 'FAILED'}, status: ${response.status}`);
            
            if (response.status === 200) {
                return { success: true, response: response.data, attemptNumber };
            } else {
                return { success: false, reason: `HTTP ${response.status}`, attemptNumber };
            }
            
        } catch (error) {
            console.log(`[${this.id}] ❌ [${this.countryConfig.flag}] Upload attempt ${attemptNumber} failed: ${error.message}`);
            
            this.uploadAttempts.push({
                success: false,
                attemptNumber: attemptNumber,
                fileName: path.basename(filePath),
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            return { success: false, reason: error.message, attemptNumber };
        }
    }
    
    getContentType(filename) {
        const ext = path.extname(filename).toLowerCase();
        const types = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp'
        };
        return types[ext] || 'application/octet-stream';
    }
    
    async checkStatus(maxWaitTime = CONFIG.verificationTimeout) {
        if (!this.verificationId) return { status: 'ERROR' };
        
        const statusUrl = this.countryConfig.statusEndpoint.replace('{verificationId}', this.verificationId);
        console.log(`[${this.id}] 🔍 [${this.countryConfig.flag}] Checking verification status (${maxWaitTime}s timeout)...`);
        
        for (let i = 0; i < maxWaitTime; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
                const response = await this.client.get(statusUrl);
                const data = response.data;
                
                console.log(`[${this.id}] ⏱️ [${this.countryConfig.flag}] Status check ${i+1}/${maxWaitTime}: ${data.currentStep}`);
                
                if (data.currentStep === 'success' && 
                    (!data.rejectionReasons || data.rejectionReasons.length === 0)) {
                    console.log(`[${this.id}] 🎉 [${this.countryConfig.flag}] Verification SUCCESS after ${i+1} seconds!`);
                    return { status: 'SUCCESS', data, waitTime: i+1 };
                }
                
                // ✅ FIXED: Handle SSO status properly
                if (data.currentStep === 'sso') {
                    console.log(`[${this.id}] 🔐 [${this.countryConfig.flag}] SSO verification detected after ${i+1} seconds - Will generate URL`);
                    return { status: 'SSO', data, waitTime: i+1 };
                }
                
                if (data.rejectionReasons?.length > 0) {
                    console.log(`[${this.id}] ❌ [${this.countryConfig.flag}] Verification REJECTED after ${i+1} seconds`);
                    return { status: 'REJECTED', data, waitTime: i+1 };
                }
                
            } catch (error) {
                console.log(`[${this.id}] ⚠️ [${this.countryConfig.flag}] Status check error at ${i+1}s: ${error.message}`);
                continue;
            }
        }
        
        console.log(`[${this.id}] ⏰ [${this.countryConfig.flag}] Status check TIMEOUT after ${maxWaitTime} seconds`);
        return { status: 'TIMEOUT', waitTime: maxWaitTime };
    }

    async visitSsoRedirect() {
        if (!this.verificationId) return { success: false, reason: 'No verification ID' };

        const endpoints = [
            this.countryConfig.redirectEndpoint.replace('{verificationId}', this.verificationId),
            `https://services.sheerid.com/redirect/${this.verificationId}`
        ];

        for (const endpoint of endpoints) {
            try {
                const response = await this.client.get(endpoint, {
                    maxRedirects: 0,
                    validateStatus: (status) => status >= 200 && status < 400
                });

                const redirectUrl = response.headers.location || response.data?.redirectUrl;
                if (redirectUrl) {
                    console.log(`[${this.id}] 🔗 [${this.countryConfig.flag}] SSO redirect opened: ${redirectUrl}`);
                    return { success: true, redirectUrl };
                }
            } catch (error) {
                if (error.response?.headers?.location) {
                    const redirectUrl = error.response.headers.location;
                    console.log(`[${this.id}] 🔗 [${this.countryConfig.flag}] SSO redirect opened via error path: ${redirectUrl}`);
                    return { success: true, redirectUrl };
                }

                console.log(`[${this.id}] ⚠️ [${this.countryConfig.flag}] Failed to open SSO redirect (${endpoint}): ${error.message}`);
            }
        }

        return { success: false, reason: 'No redirect available' };
    }

    async getSpotifyUrl() {
        if (!this.verificationId) return null;
        
        const endpoints = [
            this.countryConfig.redirectEndpoint.replace('{verificationId}', this.verificationId),
            `https://services.sheerid.com/redirect/${this.verificationId}`
        ];
        
        for (const endpoint of endpoints) {
            try {
                const response = await this.client.get(endpoint, { maxRedirects: 0 });
                let url = response.headers.location || response.data?.redirectUrl;
                
                if (url && url.includes('spotify.com')) {
                    if (!url.includes('verificationId=')) {
                        const separator = url.includes('?') ? '&' : '?';
                        url = `${url}${separator}verificationId=${this.verificationId}`;
                    }
                    return url;
                }
            } catch (error) {
                if (error.response?.headers?.location?.includes('spotify.com')) {
                    let url = error.response.headers.location;
                    if (!url.includes('verificationId=')) {
                        const separator = url.includes('?') ? '&' : '?';
                        url = `${url}${separator}verificationId=${this.verificationId}`;
                    }
                    return url;
                }
                continue;
            }
        }
        
        return this.countryConfig.finalLinkFormat.replace('{verificationId}', this.verificationId);
    }
    
    getUploadStats() {
        return {
            totalAttempts: this.uploadAttempts.length,
            successfulUploads: this.uploadAttempts.filter(a => a.success).length,
            failedUploads: this.uploadAttempts.filter(a => !a.success).length,
            attempts: this.uploadAttempts
        };
    }
}

// UTILITY FUNCTIONS
function generateEmail(firstName, lastName, countryConfig) {
    const domains = countryConfig.domains;
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const number = Math.floor(Math.random() * 9999) + 1000;
    
    const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
    
    return `${cleanFirst}.${cleanLast}.${number}@${domain}`;
}

function generateDOB() {
    const currentYear = new Date().getFullYear();
    const year = currentYear - Math.floor(Math.random() * 8) - 18;
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    
    return { day, month, year };
}

function loadStudents(countryConfig) {
    try {
        if (!fs.existsSync(CONFIG.studentsFile)) {
            console.log(chalk.red(`❌ ${CONFIG.studentsFile} not found`));
            return [];
        }
        
        const content = fs.readFileSync(CONFIG.studentsFile, 'utf-8');
        const students = content.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split('|').map(s => s.trim());
                if (parts.length < 2) return null;
                
                const [name, studentId] = parts;
                
                let firstName, lastName;
                if (name.includes(',')) {
                    [lastName, firstName] = name.split(',').map(s => s.trim());
                } else {
                    const nameParts = name.split(' ');
                    firstName = nameParts[0] || 'FIRST';
                    lastName = nameParts.slice(1).join(' ') || 'LAST';
                }
                
                return {
                    firstName: firstName.toUpperCase(),
                    lastName: lastName.toUpperCase(),
                    email: generateEmail(firstName, lastName, countryConfig),
                    studentId: studentId.trim()
                };
            })
            .filter(s => s);
            
        console.log(chalk.green(`👥 Loaded ${students.length} students`));
        return students;
    } catch (error) {
        console.log(chalk.red(`❌ Error loading students: ${error.message}`));
        return [];
    }
}

function findStudentFiles(studentId) {
    const dirs = [CONFIG.receiptsDir, 'images', 'documents'];
    const extensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
    const files = [];
    
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        
        try {
            const dirFiles = fs.readdirSync(dir);
            for (const file of dirFiles) {
                if (file.toLowerCase().includes(studentId.toLowerCase()) &&
                    extensions.some(ext => file.toLowerCase().endsWith(ext))) {
                    const filePath = path.join(dir, file);
                    if (fs.existsSync(filePath)) {
                        const stats = fs.statSync(filePath);
                        if (stats.size > 1024 && stats.size < 10485760) {
                            files.push({
                                path: filePath,
                                name: file,
                                size: stats.size
                            });
                        }
                    }
                }
            }
        } catch (e) { continue; }
    }
    
    return files.sort((a, b) => b.size - a.size);
}

function saveSpotifyUrl(student, url, verificationId, countryConfig, uploadStats = null, ssoForced = false) {
    try {
        fs.appendFileSync(CONFIG.outputFile, url + '\n');
        
        const logEntry = JSON.stringify({
            datetime: new Date().toISOString(),
            country: countryConfig.name,
            countryCode: countryConfig.code,
            programId: countryConfig.programId,
            student: {
                firstName: student.firstName,
                lastName: student.lastName,
                studentId: student.studentId,
                email: student.email
            },
            verificationId: verificationId,
            spotifyUrl: url,
            matchType: 'EXACT_JSON_MATCH',
            uploadStats: uploadStats,
            ssoForced: ssoForced
        }) + '\n';
        
        fs.appendFileSync(`spotify_${countryConfig.code}_success.txt`, logEntry);
        console.log(chalk.green(`💾 [${countryConfig.flag}] SUCCESS: ${url} ${ssoForced ? '(SSO)' : ''}`));
        return true;
    } catch (error) {
        console.error(chalk.red(`❌ [${countryConfig.flag}] Save error: ${error.message}`));
        return false;
    }
}

// ✅ FIXED MAIN PROCESSOR - PROPER SSO HANDLING
async function processStudent(student, sessionId, collegeMatcher, deleteManager, countryConfig, statsTracker) {
    const session = new VerificationSession(sessionId, countryConfig);
    let college = null;
    
    try {
        console.log(`[${sessionId}] 🎯 [${countryConfig.flag}] Processing ${student.firstName} ${student.lastName} (${student.studentId})`);
        
        // STEP 1: Check for exact match from JSON
        if (!collegeMatcher.hasReceiptForStudent(student.studentId)) {
            console.log(`[${sessionId}] ❌ [${countryConfig.flag}] No receipt file found - SKIPPING`);
            deleteManager.markStudentFailed(student.studentId);
            collegeMatcher.addFailure();
            statsTracker.recordFailureReason('noReceipt');
            return null;
        }
        
        college = collegeMatcher.getExactCollegeForStudent(student.studentId);
        if (!college) {
            console.log(`[${sessionId}] ❌ [${countryConfig.flag}] NO EXACT MATCH in ${countryConfig.collegesFile} - SKIPPING`);
            deleteManager.markStudentNoMatch(student.studentId);
            collegeMatcher.addFailure();
            statsTracker.recordFailureReason('noExactMatch');
            statsTracker.recordCollegeAttempt(collegeMatcher.getReceiptCollegeId(student.studentId), 'Unknown', false);
            return null;
        }
        
        // STEP 2: Initialize session
        const initSuccess = await session.init();
        if (!initSuccess) {
            console.log(`[${sessionId}] ❌ [${countryConfig.flag}] Session init failed`);
            deleteManager.markStudentFailed(student.studentId);
            collegeMatcher.addFailure();
            statsTracker.recordFailureReason('initFailed');
            statsTracker.recordCollegeAttempt(college.id, college.name, false);
            return null;
        }
        
        // STEP 3: Submit personal info with exact college match
        const dob = generateDOB();
        const step = await session.submitPersonalInfo(student, dob, college);
        
        if (step === 'success') {
            console.log(`[${sessionId}] 🎉 [${countryConfig.flag}] Instant success!`);
            const spotifyUrl = await session.getSpotifyUrl();
            
            if (spotifyUrl) {
                const result = { student, url: spotifyUrl, type: 'instant_exact', college: college.name };
                saveSpotifyUrl(student, spotifyUrl, session.verificationId, countryConfig, session.getUploadStats());
                deleteManager.markStudentSuccess(student.studentId);
                collegeMatcher.addSuccess();
                statsTracker.recordSuccess(result);
                statsTracker.recordCollegeAttempt(college.id, college.name, true);
                return result;
            }
        }
        
        if (step === 'error') {
            console.log(`[${sessionId}] ❌ [${countryConfig.flag}] Form submission failed`);
            deleteManager.markStudentFailed(student.studentId);
            collegeMatcher.addFailure();
            statsTracker.recordFailureReason('formFailed');
            statsTracker.recordCollegeAttempt(college.id, college.name, false);
            return null;
        }
        
        // STEP 4: Wait for step progression
        const stepResult = await session.waitForCorrectStep(6, collegeMatcher);
        
        if (stepResult === 'success') {
            console.log(`[${sessionId}] 🎉 [${countryConfig.flag}] Already success!`);
            const spotifyUrl = await session.getSpotifyUrl();
            
            if (spotifyUrl) {
                const result = { student, url: spotifyUrl, type: 'already_success_exact', college: college.name };
                saveSpotifyUrl(student, spotifyUrl, session.verificationId, countryConfig, session.getUploadStats());
                deleteManager.markStudentSuccess(student.studentId);
                collegeMatcher.addSuccess();
                statsTracker.recordSuccess(result);
                statsTracker.recordCollegeAttempt(college.id, college.name, true);
                return result;
            }
        }
        
        // ✅ FIXED: Handle SSO colleges properly - don't reject them
        if (stepResult === 'invalid_college') {
            console.log(`[${sessionId}] ❌ [${countryConfig.flag}] INVALID COLLEGE`);
            deleteManager.markStudentFailed(student.studentId);
            collegeMatcher.addFailure();
            statsTracker.recordFailureReason('invalidCollege');
            statsTracker.recordCollegeAttempt(college.id, college.name, false);
            return null;
        }
        
        const isSsoFlow = (stepResult === 'sso');
        const shouldAttemptUpload = (stepResult === 'docUpload' || isSsoFlow);

        if (isSsoFlow) {
            const redirectResult = await session.visitSsoRedirect();
            if (redirectResult.success) {
                statsTracker.successTypes.sso_redirect++;
                console.log(`[${sessionId}] 🔗 [${countryConfig.flag}] SSO redirect visited before upload`);
            } else {
                console.log(`[${sessionId}] ⚠️ [${countryConfig.flag}] Could not open SSO redirect before upload: ${redirectResult.reason}`);
            }
        }

        if (!shouldAttemptUpload) {
            console.log(`[${sessionId}] ❌ [${countryConfig.flag}] Cannot proceed - step: ${stepResult}`);
            deleteManager.markStudentFailed(student.studentId);
            collegeMatcher.addFailure();
            statsTracker.recordCollegeAttempt(college.id, college.name, false);
            return null;
        }

        // STEP 5: Find all student files
        const files = findStudentFiles(student.studentId);
        if (files.length === 0) {
            console.log(`[${sessionId}] ❌ [${countryConfig.flag}] No files found for upload`);
            deleteManager.markStudentFailed(student.studentId);
            collegeMatcher.addFailure();
            statsTracker.recordFailureReason('noFiles');
            statsTracker.recordCollegeAttempt(college.id, college.name, false);
            return null;
        }

        console.log(`[${sessionId}] 📁 [${countryConfig.flag}] Found ${files.length} file(s) for upload${isSsoFlow ? ' (forcing upload for SSO)' : ''}`);

        // STEP 6: Try uploading ALL files until success
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const attemptNumber = i + 1;

            console.log(`[${sessionId}] 📤 [${countryConfig.flag}] Attempting upload ${attemptNumber}/${files.length}: ${file.name}`);

            const uploadResult = await session.uploadDocument(file.path, attemptNumber);

            if (uploadResult.success) {
                console.log(`[${sessionId}] ✅ [${countryConfig.flag}] Upload ${attemptNumber} successful! Waiting ${CONFIG.verificationTimeout}s for verification...`);
                collegeMatcher.incrementUploadRetry();

                // Wait for verification status
                const statusResult = await session.checkStatus(CONFIG.verificationTimeout);

                // ✅ FIXED: Handle SSO success properly
                if (statusResult.status === 'SUCCESS' || statusResult.status === 'SSO') {
                    const successType = statusResult.status === 'SSO' ? 'upload_sso' : 'upload_exact';
                    console.log(`[${sessionId}] 🎉 [${countryConfig.flag}] Verification ${statusResult.status} after upload ${attemptNumber}!`);
                    const spotifyUrl = await session.getSpotifyUrl();

                    if (spotifyUrl) {
                        const result = {
                            student,
                            url: spotifyUrl,
                            type: successType,
                            college: college.name,
                            fileUsed: file.name,
                            uploadAttempt: attemptNumber,
                            waitTime: statusResult.waitTime,
                            ssoForced: (statusResult.status === 'SSO') || isSsoFlow
                        };
                        saveSpotifyUrl(student, spotifyUrl, session.verificationId, countryConfig, session.getUploadStats(), (statusResult.status === 'SSO') || isSsoFlow);
                        deleteManager.markStudentSuccess(student.studentId);
                        collegeMatcher.addSuccess();
                        statsTracker.recordSuccess(result);
                        statsTracker.recordCollegeAttempt(college.id, college.name, true);
                        return result;
                    }
                } else if (statusResult.status === 'REJECTED') {
                    console.log(`[${sessionId}] ❌ [${countryConfig.flag}] Document ${attemptNumber} rejected after ${statusResult.waitTime}s - trying next file...`);
                    collegeMatcher.incrementUploadRetry();
                    continue;
                } else if (statusResult.status === 'TIMEOUT') {
                    console.log(`[${sessionId}] ⏰ [${countryConfig.flag}] Verification timeout after upload ${attemptNumber} - trying next file...`);
                    collegeMatcher.incrementUploadRetry();
                    continue;
                }

            } else {
                console.log(`[${sessionId}] ❌ [${countryConfig.flag}] Upload ${attemptNumber} failed: ${uploadResult.reason} - trying next file...`);
                collegeMatcher.incrementUploadRetry();
                continue;
            }
        }

        // STEP 7: All uploads exhausted
        console.log(`[${sessionId}] ❌ [${countryConfig.flag}] All ${files.length} file(s) exhausted`);
        deleteManager.markStudentRejected(student.studentId);
        collegeMatcher.addFailure();
        statsTracker.recordCollegeAttempt(college.id, college.name, false);
        return null;
        
    } catch (error) {
        console.log(`[${sessionId}] ❌ [${countryConfig.flag}] Process error: ${error.message}`);
        deleteManager.markStudentFailed(student.studentId);
        collegeMatcher.addFailure();
        if (college) {
            statsTracker.recordCollegeAttempt(college.id, college.name, false);
        }
        return null;
    }
}

// BULK PROCESSOR WITH TARGET TRACKING
async function processBulk(students, collegeMatcher, deleteManager, countryConfig, targetLinks, statsTracker) {
    console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════════╗
║     🚀 MULTI-COUNTRY MODE - ${CONFIG.maxConcurrent} CONCURRENT WORKERS 🚀          ║
║            Program ID: ${countryConfig.programId}              ║
║            Country: ${countryConfig.flag} ${countryConfig.name.padEnd(25)} ║
║            Source: ONLY ${countryConfig.collegesFile.padEnd(20)} ║
║            Upload: FIXED SSO HANDLING                          ║
║            Target: ${targetLinks.toString().padStart(4)} links to generate                        ║
╚══════════════════════════════════════════════════════════════════╝
`));
    
    console.log(chalk.blue(`🌍 Country: ${countryConfig.flag} ${countryConfig.name} (${countryConfig.code.toUpperCase()})`));
    console.log(chalk.blue(`🆔 Program ID: ${countryConfig.programId}`));
    console.log(chalk.blue(`👥 Students: ${students.length}`));
    console.log(chalk.green(`🎯 Target: ${targetLinks} links`));
    console.log(chalk.blue(`⚡ Concurrent: ${CONFIG.maxConcurrent} workers`));
    console.log(chalk.green(`📚 Source: ONLY ${countryConfig.collegesFile} - EXACT MATCHES ONLY`));
    console.log(chalk.red(`⛔ NO FALLBACK: Students without exact matches will be skipped`));
    console.log(chalk.blue(`🔐 SSO SUPPORT: Proper SSO college handling`));
    console.log(chalk.yellow(`🔄 UPLOAD RETRY: Will try all available files if first fails`));
    console.log(chalk.yellow(`⏱️ VERIFICATION TIMEOUT: ${CONFIG.verificationTimeout} seconds after each upload`));
    console.log(chalk.red(`🗑️ Auto-delete: Immediate cleanup after processing`));
    console.log(chalk.green(`📁 Output: ${CONFIG.outputFile}`));
    
    const results = [];
    const chunks = [];
    
    for (let i = 0; i < students.length; i += CONFIG.batchSize) {
        chunks.push(students.slice(i, i + CONFIG.batchSize));
    }
    
    let taskCounter = 1;
    
    for (const [batchIndex, batch] of chunks.entries()) {
        // Check if target reached
        if (results.length >= targetLinks) {
            console.log(chalk.green(`\n🎯 TARGET REACHED! Generated ${results.length}/${targetLinks} links. Stopping...`));
            CONFIG.targetReached = true;
            break;
        }
        
        console.log(chalk.yellow(`\n📦 [${countryConfig.flag}] Processing batch ${batchIndex + 1}/${chunks.length}: ${batch.length} students`));
        console.log(chalk.cyan(`📊 Progress: ${results.length}/${targetLinks} links generated`));
        
        const batchChunks = [];
        for (let i = 0; i < batch.length; i += CONFIG.maxConcurrent) {
            batchChunks.push(batch.slice(i, i + CONFIG.maxConcurrent));
        }
        
        for (const chunk of batchChunks) {
            // Check target before processing chunk
            if (results.length >= targetLinks) {
                console.log(chalk.green(`\n🎯 TARGET REACHED! Stopping batch processing...`));
                break;
            }
            
            const promises = chunk.map((student) => 
                processStudent(student, taskCounter++, collegeMatcher, deleteManager, countryConfig, statsTracker)
            );
            
            const chunkResults = await Promise.allSettled(promises);
            
            for (const result of chunkResults) {
                if (result.status === 'fulfilled' && result.value) {
                    results.push(result.value);
                    
                    // Check if target reached after each success
                    if (results.length >= targetLinks) {
                        console.log(chalk.green(`\n🎉 TARGET REACHED! ${results.length}/${targetLinks} links generated!`));
                        CONFIG.targetReached = true;
                        break;
                    }
                }
            }
            
            // Break if target reached
            if (CONFIG.targetReached) break;
            
            const stats = collegeMatcher.getStats();
            const percentage = ((results.length / targetLinks) * 100).toFixed(1);
            console.log(chalk.blue(`📊 [${countryConfig.flag}] Progress: ${results.length}/${targetLinks} (${percentage}%) | Retries: ${stats.uploadRetries}`));
            
            if (batchChunks.indexOf(chunk) < batchChunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Break outer loop if target reached
        if (CONFIG.targetReached) break;
        
        if (batchIndex < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.batchDelay));
        }
    }
    
    return results;
}

// DISPLAY DETAILED ANALYSIS
function displayDetailedAnalysis(analysis, countryConfig, matcherStats) {
    console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════════╗
║                    📊 DETAILED ANALYSIS 📊                       ║
╚══════════════════════════════════════════════════════════════════╝
`));
    
    // OVERVIEW
    console.log(chalk.yellow('═══════════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('📈 OVERALL STATISTICS'));
    console.log(chalk.yellow('═══════════════════════════════════════════════════════════════════'));
    console.log(chalk.blue(`🌍 Country: ${countryConfig.flag} ${countryConfig.name}`));
    console.log(chalk.blue(`🆔 Program ID: ${countryConfig.programId}`));
    console.log(chalk.green(`✅ Total Success: ${analysis.totalSuccess} links`));
    console.log(chalk.blue(`⏱️  Total Time: ${analysis.totalTime.toFixed(2)} seconds`));
    console.log(chalk.blue(`⚡ Average Time per Link: ${analysis.avgTimePerLink}s`));
    console.log(chalk.blue(`🚀 Links per Second: ${(analysis.totalSuccess / analysis.totalTime).toFixed(3)}`));
    console.log(chalk.blue(`📊 Success Rate: ${matcherStats.successRate}%`));
    console.log(chalk.blue(`🎯 Exact Match Rate: ${matcherStats.exactMatchRate}%`));
    
    // SUCCESS TYPES BREAKDOWN
    console.log(chalk.yellow('\n═══════════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('🎯 SUCCESS TYPES BREAKDOWN'));
    console.log(chalk.yellow('═══════════════════════════════════════════════════════════════════'));
    
    const successTypes = analysis.successTypes;
    const total = analysis.totalSuccess;
    
    if (total > 0) {
        if (successTypes.instant_exact > 0) {
            const pct = ((successTypes.instant_exact / total) * 100).toFixed(1);
            console.log(chalk.green(`⚡ Instant Success: ${successTypes.instant_exact} (${pct}%)`));
        }
        if (successTypes.already_success_exact > 0) {
            const pct = ((successTypes.already_success_exact / total) * 100).toFixed(1);
            console.log(chalk.green(`✨ Already Success: ${successTypes.already_success_exact} (${pct}%)`));
        }
        if (successTypes.upload_exact > 0) {
            const pct = ((successTypes.upload_exact / total) * 100).toFixed(1);
            console.log(chalk.green(`📤 Upload Success: ${successTypes.upload_exact} (${pct}%)`));
        }
        if (successTypes.upload_sso > 0) {
            const pct = ((successTypes.upload_sso / total) * 100).toFixed(1);
            console.log(chalk.blue(`🔐 SSO Upload Success: ${successTypes.upload_sso} (${pct}%)`));
        }
        if (successTypes.sso_redirect > 0) {
            const pct = ((successTypes.sso_redirect / total) * 100).toFixed(1);
            console.log(chalk.blue(`🔗 SSO Redirect Success: ${successTypes.sso_redirect} (${pct}%)`));
        }
    }
    
    // UPLOAD STATISTICS
    console.log(chalk.yellow('\n═══════════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('📤 UPLOAD ATTEMPT STATISTICS'));
    console.log(chalk.yellow('═══════════════════════════════════════════════════════════════════'));
    
    const uploadStats = analysis.uploadStats;
    const totalUploadSuccess = uploadStats.firstAttemptSuccess + uploadStats.secondAttemptSuccess + uploadStats.thirdPlusAttemptSuccess;
    
    if (totalUploadSuccess > 0) {
        if (uploadStats.firstAttemptSuccess > 0) {
            const pct = ((uploadStats.firstAttemptSuccess / totalUploadSuccess) * 100).toFixed(1);
            console.log(chalk.green(`🥇 First Attempt Success: ${uploadStats.firstAttemptSuccess} (${pct}%)`));
        }
        if (uploadStats.secondAttemptSuccess > 0) {
            const pct = ((uploadStats.secondAttemptSuccess / totalUploadSuccess) * 100).toFixed(1);
            console.log(chalk.yellow(`🥈 Second Attempt Success: ${uploadStats.secondAttemptSuccess} (${pct}%)`));
        }
        if (uploadStats.thirdPlusAttemptSuccess > 0) {
            const pct = ((uploadStats.thirdPlusAttemptSuccess / totalUploadSuccess) * 100).toFixed(1);
            console.log(chalk.blue(`🥉 Third+ Attempt Success: ${uploadStats.thirdPlusAttemptSuccess} (${pct}%)`));
        }
        console.log(chalk.red(`❌ All Attempts Failed: ${uploadStats.allAttemptsFailed}`));
        console.log(chalk.cyan(`🔄 Total Upload Retries: ${matcherStats.uploadRetries}`));
    }
    
    // TOP COLLEGES
    if (analysis.topColleges.length > 0) {
        console.log(chalk.yellow('\n═══════════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('🏆 TOP 10 WORKING COLLEGES'));
        console.log(chalk.yellow('═══════════════════════════════════════════════════════════════════'));
        
        analysis.topColleges.forEach(([collegeId, stats], index) => {
            const successRate = ((stats.success / (stats.success + stats.failed)) * 100).toFixed(1);
            console.log(chalk.green(`${index + 1}. College ID ${collegeId}: ${stats.success} success | Rate: ${successRate}%`));
            console.log(chalk.gray(`   ${stats.name.substring(0, 70)}${stats.name.length > 70 ? '...' : ''}`));
        });
    }
    
    // FAILURE REASONS
    console.log(chalk.yellow('\n═══════════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('❌ FAILURE BREAKDOWN'));
    console.log(chalk.yellow('═══════════════════════════════════════════════════════════════════'));
    
    const failures = analysis.processingStats;
    if (failures.noReceipt > 0) console.log(chalk.red(`📄 No Receipt File: ${failures.noReceipt}`));
    if (failures.noExactMatch > 0) console.log(chalk.red(`🎯 No Exact Match: ${failures.noExactMatch}`));
    if (failures.invalidCollege > 0) console.log(chalk.red(`🏫 Invalid College: ${failures.invalidCollege}`));
    if (failures.initFailed > 0) console.log(chalk.red(`🔌 Init Failed: ${failures.initFailed}`));
    if (failures.formFailed > 0) console.log(chalk.red(`📝 Form Failed: ${failures.formFailed}`));
    if (failures.noFiles > 0) console.log(chalk.red(`📁 No Files: ${failures.noFiles}`));
    
    // COLLEGE STATISTICS
    console.log(chalk.yellow('\n═══════════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('🏫 COLLEGE STATISTICS'));
    console.log(chalk.yellow('═══════════════════════════════════════════════════════════════════'));
    console.log(chalk.green(`✅ Working Colleges: ${matcherStats.workingColleges}`));
    console.log(chalk.red(`❌ Invalid Colleges: ${matcherStats.invalidColleges}`));
    console.log(chalk.blue(`📚 Total Colleges Loaded: ${matcherStats.totalColleges}`));
    
    // TIME ANALYSIS
    if (analysis.linkTimes.length > 5) {
        console.log(chalk.yellow('\n═══════════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('⏱️  TIME ANALYSIS'));
        console.log(chalk.yellow('═══════════════════════════════════════════════════════════════════'));
        
        const times = analysis.linkTimes.map(l => l.time / 1000);
        const fastest = Math.min(...times);
        const slowest = Math.max(...times);
        const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
        
        console.log(chalk.green(`⚡ Fastest Link: ${fastest.toFixed(2)}s`));
        console.log(chalk.blue(`📊 Median Time: ${median.toFixed(2)}s`));
        console.log(chalk.yellow(`🐌 Slowest Link: ${slowest.toFixed(2)}s`));
    }
    
    console.log(chalk.yellow('\n═══════════════════════════════════════════════════════════════════\n'));
}

// MAIN FUNCTION
async function main() {
    console.clear();
    console.log(chalk.cyan('🎵 Spotify SheerID - MULTI-COUNTRY MODE (24 COUNTRIES)'));
    console.log(chalk.green('🌍 All countries use the same program ID: 63fd266996552d469aea40e1'));
    console.log(chalk.yellow('🔒 FIXED SSO HANDLING - Proper SSO college processing'));
    
    try {
        // SELECT COUNTRY
        const selectedCountryCode = await selectCountry();
        const countryConfig = COUNTRIES[selectedCountryCode];
        
        CONFIG.selectedCountry = selectedCountryCode;
        CONFIG.countryConfig = countryConfig;
        
        console.log(chalk.green(`\n✅ Selected Country: ${countryConfig.flag} ${countryConfig.name} (${countryConfig.code.toUpperCase()})`));
        console.log(chalk.blue(`🆔 Program ID: ${countryConfig.programId}`));
        console.log(chalk.blue(`📚 Using colleges file: ${countryConfig.collegesFile}`));
        console.log(chalk.red(`⛔ LEGIT ONLY: Only exact JSON matches will be processed`));
        console.log(chalk.blue(`🔐 SSO SUPPORT: Proper SSO college handling`));
        console.log(chalk.yellow(`🔄 UPLOAD RETRY: Will try all available files if first fails`));
        console.log(chalk.yellow(`⏱️ TIMEOUT: ${CONFIG.verificationTimeout} seconds after each upload`));
        
        // Initialize college matcher with country config
        const collegeMatcher = new ExactJsonCollegeMatcher(countryConfig);
        
        if (!collegeMatcher.analyzeReceipts()) {
            console.log(chalk.red(`❌ [${countryConfig.flag}] Failed to analyze receipts`));
            return;
        }
        
        if (!collegeMatcher.loadColleges()) {
            console.log(chalk.red(`❌ [${countryConfig.flag}] Failed to load ${countryConfig.collegesFile}`));
            return;
        }
        
        const deleteManager = new ImmediateDeleteManager();
        const statsTracker = new StatisticsTracker();
        
        const students = loadStudents(countryConfig);
        if (students.length === 0) return;
        
        const studentsWithExactMatches = students.filter(s => {
            if (!collegeMatcher.hasReceiptForStudent(s.studentId)) return false;
            const collegeId = collegeMatcher.getReceiptCollegeId(s.studentId);
            return collegeMatcher.isCollegeInJson(collegeId);
        });
        
        console.log(chalk.green(`👥 [${countryConfig.flag}] Students with receipts: ${students.filter(s => collegeMatcher.hasReceiptForStudent(s.studentId)).length}`));
        console.log(chalk.green(`✅ [${countryConfig.flag}] Students with EXACT JSON matches: ${studentsWithExactMatches.length}`));
        console.log(chalk.red(`❌ [${countryConfig.flag}] Students WITHOUT exact matches (will be skipped): ${students.length - studentsWithExactMatches.length}`));
        
        if (studentsWithExactMatches.length === 0) {
            console.log(chalk.red(`❌ [${countryConfig.flag}] No students have exact college matches in ${countryConfig.collegesFile}`));
            return;
        }
        
        // ASK TARGET LINKS
        const targetLinks = await askTargetLinks(studentsWithExactMatches.length);
        CONFIG.targetLinks = targetLinks;
        
        console.log(chalk.cyan(`\n🚀 Starting multi-country processing with target: ${targetLinks} links\n`));
        
        const startTime = Date.now();
        const results = await processBulk(studentsWithExactMatches, collegeMatcher, deleteManager, countryConfig, targetLinks, statsTracker);
        const totalTime = (Date.now() - startTime) / 1000;
        
        // Finalize statistics
        statsTracker.finalize();
        
        const stats = collegeMatcher.getStats();
        const analysis = statsTracker.getDetailedAnalysis();
        
        console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════════╗
║          🎉 ${countryConfig.flag} PROCESSING COMPLETE! 🎉                      ║
║          ${results.length.toString().padStart(3)} / ${targetLinks.toString().padStart(3)} Spotify links generated!              ║
║              Success Rate: ${stats.successRate.padStart(5)}%                             ║
║              Exact Match Rate: ${stats.exactMatchRate.padStart(5)}%                         ║
║              Upload Retries: ${stats.uploadRetries.toString().padStart(4)}                           ║
║              All links saved to ${CONFIG.outputFile.padEnd(15)}              ║
║              Processing Time: ${totalTime.toFixed(1)} seconds                ║
║              📚 Source: ONLY ${countryConfig.collegesFile} (LEGIT)        ║
║              🔐 SSO SUPPORT: Proper SSO handling                 ║
╚══════════════════════════════════════════════════════════════════╝
`));
        
        if (results.length > 0) {
            // Display detailed analysis
            displayDetailedAnalysis(analysis, countryConfig, stats);
            
            // Summary
            console.log(chalk.green(`✅ Final Success: ${results.length}/${targetLinks} links (${((results.length/targetLinks)*100).toFixed(1)}% of target)`));
            console.log(chalk.green(`🎯 Exact Match Rate: ${stats.exactMatchRate}%`));
            console.log(chalk.blue(`⚡ Average Rate: ${(results.length / totalTime).toFixed(2)} links/second`));
            console.log(chalk.blue(`📚 Total Colleges: ${stats.totalColleges} loaded`));
            console.log(chalk.green(`✅ Exact Matches Found: ${stats.exactMatches}`));
            console.log(chalk.green(`✅ Working Colleges: ${stats.workingColleges} confirmed`));
            console.log(chalk.red(`❌ Invalid Colleges: ${stats.invalidColleges} marked`));
            console.log(chalk.yellow(`🔄 Upload Retries: ${stats.uploadRetries} total attempts`));
            
            if (CONFIG.targetReached) {
                console.log(chalk.green(`\n🎯 TARGET ACHIEVED! Successfully generated ${results.length} links as requested.`));
            } else if (results.length < targetLinks) {
                console.log(chalk.yellow(`\n⚠️  Target not fully reached: ${results.length}/${targetLinks} (${((results.length/targetLinks)*100).toFixed(1)}%)`));
                console.log(chalk.yellow(`   Consider adding more students with exact college matches.`));
            }
        }
        
    } catch (error) {
        console.error(chalk.red(`❌ Critical error: ${error.message}`));
        console.error(error.stack);
    }
}

// ERROR HANDLING
process.on('unhandledRejection', (err) => {
    console.log(chalk.red(`\n⚠️ Unhandled promise rejection: ${err.message}`));
});

process.on('uncaughtException', (err) => {
    console.log(chalk.red(`\n💥 Uncaught exception: ${err.message}`));
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Processing stopped by user'));
    process.exit(0);
});

// STARTUP MESSAGE
console.log(chalk.cyan(`
🎵 SPOTIFY SHEERID - MULTI-COUNTRY MODE (24 COUNTRIES SUPPORTED) 🎵
🌍 Program ID: 63fd266996552d469aea40e1 (Same for ALL countries)
🔒 FIXED SSO HANDLING - Proper SSO college processing
📚 Source: Reads country-specific JSON files - EXACT MATCHES ONLY
⛔ NO FALLBACK: Students without exact matches are skipped
🔄 UPLOAD RETRY: Tries all available files if first fails
⏱️ VERIFICATION TIMEOUT: ${CONFIG.verificationTimeout} seconds after each upload
🔐 SSO SUPPORT: Proper SSO college handling
📤 BULK: ${CONFIG.maxConcurrent} concurrent workers, ${CONFIG.batchSize} batch size
🗑️ DELETE: Immediate cleanup of processed students and receipts
🔗 Generates: spotify.com/student/apply/sheerid-program?verificationId=ID

SUPPORTED COUNTRIES (24):
🇺🇸 US  🇨🇦 CA  🇬🇧 GB  🇮🇳 IN  🇮🇩 ID  🇦🇺 AU  🇩🇪 DE  🇫🇷 FR
🇪🇸 ES  🇮🇹 IT  🇧🇷 BR  🇲🇽 MX  🇳🇱 NL  🇸🇪 SE  🇳🇴 NO  🇩🇰 DK
🇯🇵 JP  🇰🇷 KR  🇸🇬 SG  🇳🇿 NZ  🇿🇦 ZA  🇨🇳 CN  🇦🇪 AE  🇵🇭 PH
`));

// RUN MAIN FUNCTION
if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red('❌ Fatal error:'), error.message);
        console.error(error.stack);
        process.exit(1);
    });
}

module.exports = {
    CONFIG,
    COUNTRIES,
    ExactJsonCollegeMatcher,
    ImmediateDeleteManager,
    VerificationSession,
    StatisticsTracker,
    processStudent,
    processBulk,
    selectCountry,
    askTargetLinks,
    generateEmail,
    generateDOB,
    loadStudents,
    findStudentFiles,
    saveSpotifyUrl,
    displayDetailedAnalysis,
    main
};