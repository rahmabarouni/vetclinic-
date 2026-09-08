import 'package:flutter/material.dart';
import '../models/pet.dart';
import '../theme/app_theme.dart';

class PetDetailScreen extends StatelessWidget {
  final Pet pet;
  const PetDetailScreen({super.key, required this.pet});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(pet.name)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: CircleAvatar(
                radius: 48,
                backgroundColor: AppColors.primaryLight,
                child: Icon(_speciesIcon(pet.species), size: 48, color: AppColors.primary),
              ),
            ),
            const SizedBox(height: 24),
            _infoRow('Nom', pet.name),
            _infoRow('Espèce', pet.speciesLabel),
            if (pet.breed != null && pet.breed!.isNotEmpty) _infoRow('Race', pet.breed!),
            _infoRow('Sexe', pet.sexLabel),
            if (pet.weightKg != null) _infoRow('Poids', '${pet.weightKg} kg'),
            if (pet.birthDate != null && pet.birthDate!.isNotEmpty) _infoRow('Date de naissance', pet.birthDate!),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: const TextStyle(color: Colors.grey, fontWeight: FontWeight.w500)),
          ),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }

  IconData _speciesIcon(String species) {
    switch (species) {
      case 'DOG':
        return Icons.pets;
      case 'CAT':
        return Icons.pets;
      case 'BIRD':
        return Icons.egg;
      case 'RABBIT':
        return Icons.pets;
      default:
        return Icons.pets;
    }
  }
}
