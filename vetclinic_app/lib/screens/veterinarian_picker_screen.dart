import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/veterinarian.dart';
import '../providers/veterinarians_provider.dart';
import '../theme/app_theme.dart';

class VeterinarianPickerScreen extends ConsumerStatefulWidget {
  const VeterinarianPickerScreen({super.key});

  @override
  ConsumerState<VeterinarianPickerScreen> createState() => _VeterinarianPickerScreenState();
}

class _VeterinarianPickerScreenState extends ConsumerState<VeterinarianPickerScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (!mounted) return;
      final state = ref.read(veterinariansProvider);
      if (state.status == VeterinariansStatus.initial) {
        ref.read(veterinariansProvider.notifier).loadVeterinarians(availableOnly: true);
      }
    });
  }

  void _select(Veterinarian veterinarian) {
    Navigator.pop(context, veterinarian);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(veterinariansProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Choisir un vétérinaire')),
      body: _buildBody(state),
    );
  }

  Widget _buildBody(VeterinariansState state) {
    switch (state.status) {
      case VeterinariansStatus.initial:
      case VeterinariansStatus.loading:
        return const Center(child: CircularProgressIndicator());
      case VeterinariansStatus.error:
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              Text(state.error ?? 'Erreur inconnue'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => ref.read(veterinariansProvider.notifier).refresh(),
                child: const Text('Réessayer'),
              ),
            ],
          ),
        );
      case VeterinariansStatus.loaded:
        if (state.veterinarians.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.medical_services_outlined, size: 64, color: Colors.grey),
                SizedBox(height: 16),
                Text('Aucun vétérinaire disponible', style: TextStyle(fontSize: 18, color: Colors.grey)),
                SizedBox(height: 8),
                Text('Revenez plus tard', style: TextStyle(color: Colors.grey)),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () => ref.read(veterinariansProvider.notifier).refresh(),
          child: ListView.builder(
            padding: const EdgeInsets.all(8),
            itemCount: state.veterinarians.length,
            itemBuilder: (context, index) {
              final veterinarian = state.veterinarians[index];
              return Card(
                margin: const EdgeInsets.symmetric(vertical: 4),
                child: ListTile(
                  onTap: () => _select(veterinarian),
                  leading: CircleAvatar(
                    backgroundColor: AppColors.primaryLight,
                    child: const Icon(Icons.medical_services, color: AppColors.primary),
                  ),
                  title: Text(
                    veterinarian.displayName,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text(
                    veterinarian.specialty.isEmpty
                        ? 'Vétérinaire généraliste'
                        : veterinarian.specialty,
                    style: const TextStyle(fontSize: 13),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                ),
              );
            },
          ),
        );
    }
  }
}