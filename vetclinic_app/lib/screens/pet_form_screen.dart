import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../providers/auth_provider.dart';
import '../providers/pets_provider.dart';
import '../theme/app_theme.dart';

class PetFormScreen extends ConsumerStatefulWidget {
  const PetFormScreen({super.key});

  @override
  ConsumerState<PetFormScreen> createState() => _PetFormScreenState();
}

class _PetFormScreenState extends ConsumerState<PetFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _breedController = TextEditingController();
  final _weightController = TextEditingController();
  String _species = 'DOG';
  String _sex = 'UNKNOWN';
  bool _submitting = false;
  XFile? _photo;

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (picked != null && mounted) {
      setState(() => _photo = picked);
    }
  }

  Future<String?> _uploadPhoto() async {
    final photo = _photo;
    if (photo == null) return null;
    final api = ref.read(apiServiceProvider);
    return api.uploadFile(path: photo.path, filename: photo.name);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _breedController.dispose();
    _weightController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);

    String? photoUrl;
    if (_photo != null) {
      try {
        photoUrl = await _uploadPhoto();
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("Impossible d'enregistrer la photo"),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }

    final success = await ref.read(petsProvider.notifier).createPet(
      name: _nameController.text.trim(),
      species: _species,
      breed: _breedController.text.trim().isEmpty ? null : _breedController.text.trim(),
      sex: _sex,
      weightKg: double.tryParse(_weightController.text),
      photoUrl: photoUrl,
    );

    setState(() => _submitting = false);

    if (success && mounted) {
      Navigator.pop(context, true);
    } else if (mounted) {
      final error = ref.read(petsProvider).error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error ?? 'Erreur lors de la création'), backgroundColor: Colors.red),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ajouter un animal')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Nom *',
                  prefixIcon: Icon(Icons.pets),
                  border: OutlineInputBorder(),
                ),
                validator: (v) => v == null || v.trim().isEmpty ? 'Nom requis' : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _species,
                decoration: const InputDecoration(
                  labelText: 'Espèce *',
                  prefixIcon: Icon(Icons.category),
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'DOG', child: Text('Chien')),
                  DropdownMenuItem(value: 'CAT', child: Text('Chat')),
                  DropdownMenuItem(value: 'BIRD', child: Text('Oiseau')),
                  DropdownMenuItem(value: 'RABBIT', child: Text('Lapin')),
                  DropdownMenuItem(value: 'RODENT', child: Text('Rongeur')),
                  DropdownMenuItem(value: 'REPTILE', child: Text('Reptile')),
                  DropdownMenuItem(value: 'OTHER', child: Text('Autre')),
                ],
                onChanged: (v) => setState(() => _species = v ?? 'DOG'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _breedController,
                decoration: const InputDecoration(
                  labelText: 'Race',
                  prefixIcon: Icon(Icons.info_outline),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _sex,
                decoration: const InputDecoration(
                  labelText: 'Sexe',
                  prefixIcon: Icon(Icons.wc),
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'MALE', child: Text('Mâle')),
                  DropdownMenuItem(value: 'FEMALE', child: Text('Femelle')),
                  DropdownMenuItem(value: 'UNKNOWN', child: Text('Inconnu')),
                ],
                onChanged: (v) => setState(() => _sex = v ?? 'UNKNOWN'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _weightController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Poids (kg)',
                  prefixIcon: Icon(Icons.monitor_weight_outlined),
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  if (v != null && v.isNotEmpty) {
                    final n = double.tryParse(v);
                    if (n == null || n <= 0) return 'Poids invalide';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _photo != null
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.file(
                            File(_photo!.path),
                            width: 64,
                            height: 64,
                            fit: BoxFit.cover,
                          ),
                        )
                      : Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            color: AppColors.primaryLight,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.pets,
                            color: AppColors.primary,
                          ),
                        ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pickPhoto,
                      icon: const Icon(Icons.add_a_photo_outlined),
                      label: Text(_photo != null ? 'Changer la photo' : 'Ajouter une photo'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              SizedBox(
                height: 48,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                    ),
                  child: _submitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Créer'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
