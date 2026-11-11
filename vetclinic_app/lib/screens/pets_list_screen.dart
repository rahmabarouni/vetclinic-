import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/pet.dart';
import '../providers/pets_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/pet_species_image.dart';
import 'pet_detail_screen.dart';
import 'pet_form_screen.dart';

class PetsListScreen extends ConsumerStatefulWidget {
  const PetsListScreen({super.key});

  @override
  ConsumerState<PetsListScreen> createState() => _PetsListScreenState();
}

class _PetsListScreenState extends ConsumerState<PetsListScreen> {
  @override
  Widget build(BuildContext context) {
    final petsState = ref.watch(petsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Mes animaux')),
      body: _buildBody(petsState),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final result = await Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const PetFormScreen()),
          );
          if (result == true) {
            ref.read(petsProvider.notifier).refresh();
          }
        },
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildBody(PetsState petsState) {
    switch (petsState.status) {
      case PetsStatus.initial:
      case PetsStatus.loading:
        return const Center(child: CircularProgressIndicator());
      case PetsStatus.error:
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              Text(petsState.error ?? 'Erreur inconnue'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => ref.read(petsProvider.notifier).refresh(),
                child: const Text('Réessayer'),
              ),
            ],
          ),
        );
      case PetsStatus.loaded:
        if (petsState.pets.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.pets, size: 64, color: Colors.grey),
                SizedBox(height: 16),
                Text('Aucun animal', style: TextStyle(fontSize: 18, color: Colors.grey)),
                SizedBox(height: 8),
                Text('Appuyez + pour ajouter', style: TextStyle(color: Colors.grey)),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () => ref.read(petsProvider.notifier).refresh(),
          child: ListView.builder(
            padding: const EdgeInsets.all(8),
            itemCount: petsState.pets.length,
            itemBuilder: (context, index) {
              final pet = petsState.pets[index];
              return _PetCard(
                pet: pet,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => PetDetailScreen(pet: pet)),
                ),
              );
            },
          ),
        );
    }
  }
}

class _PetCard extends StatelessWidget {
  final Pet pet;
  final VoidCallback onTap;
  const _PetCard({required this.pet, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: AppColors.primaryLight,
          child: PetSpeciesImage(species: pet.species, size: 32),
        ),
        title: Text(pet.name, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(
          '${pet.speciesLabel}${pet.breed != null ? ' · ${pet.breed}' : ''}${pet.weightKg != null ? ' · ${pet.weightKg} kg' : ''}',
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}
