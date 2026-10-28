#!/usr/bin/env node
// Apenas o subprocesso git recebe esta variável; não grava a chave no remote.
process.stdout.write(/username/i.test(process.argv[2] || '') ? 'x-access-token' : (process.env.FBR_GIT_TOKEN || ''));
