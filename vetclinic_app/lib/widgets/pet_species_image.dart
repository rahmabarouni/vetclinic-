import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Affiche l'illustration correspondant à l'espèce d'un animal.
///
/// Les images sont fournies dans `assets/animals/`. Si l'espèce n'a pas
/// d'illustration dédiée, une icône "patte" est utilisée en fallback.
class PetSpeciesImage extends StatelessWidget {
  final String species;
  final double size;

  const PetSpeciesImage({super.key, required this.species, this.size = 32});

  static const Map<String, String> _assets = {
    'DOG': 'assets/animals/dog.png',
    'CAT': 'assets/animals/cat.png',
    'BIRD': 'assets/animals/bird.png',
    'RABBIT': 'assets/animals/rabbit.png',
    'RODENT': 'assets/animals/rodent.png',
    'REPTILE': 'assets/animals/reptile.png',
  };

  /// Chemin de l'image pour une espèce, ou `null` s'il n'y en a pas.
  static String? assetFor(String species) => _assets[species.toUpperCase()];

  @override
  Widget build(BuildContext context) {
    final asset = assetFor(species);
    if (asset == null) {
      return Icon(Icons.pets, size: size * 0.7, color: AppColors.primary);
    }
    return Image.asset(
      asset,
      width: size,
      height: size,
      fit: BoxFit.contain,
      // En cas d'échec de chargement, on retombe sur l'icône générique.
      errorBuilder: (_, _, _) =>
          Icon(Icons.pets, size: size * 0.7, color: AppColors.primary),
    );
  }
}
