import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

    final success = await ref.read(petsProvider.notifier).createPet(
      name: _nameController.text.trim(),
      species: _species,
      breed: _breedController.text.trim().isEmpty ? null : _breedController.text.trim(),
      sex: _sex,
      weightKg: double.tryParse(_weightController.text),
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
