import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import 'notifications_screen.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  String _initials(String firstName, String lastName) {
    final f = firstName.isNotEmpty ? firstName[0] : '?';
    final l = lastName.isNotEmpty ? lastName[0] : '';
    return '$f$l'.toUpperCase();
  }

  String _roleLabel(String role) {
    switch (role) {
      case 'VETERINARIAN':
        return 'Vétérinaire';
      case 'ADMIN':
      case 'STAFF':
        return 'Personnel';
      default:
        return 'Client';
    }
  }

  Future<void> _editInfo(BuildContext context, WidgetRef ref) async {
    final user = ref.read(authProvider).user;
    final phoneController = TextEditingController(text: user?.phone ?? '');
    final addressController = TextEditingController(text: user?.address ?? '');

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Mes informations'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Téléphone',
                prefixIcon: Icon(Icons.phone_outlined),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: addressController,
              keyboardType: TextInputType.streetAddress,
              decoration: const InputDecoration(
                labelText: 'Adresse',
                prefixIcon: Icon(Icons.home_outlined),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );

    if (saved == true && context.mounted) {
      await ref.read(authProvider.notifier).updateProfile(
            phone: phoneController.text.trim().isEmpty
                ? null
                : phoneController.text.trim(),
            address: addressController.text.trim().isEmpty
                ? null
                : addressController.text.trim(),
            firstName: user?.firstName,
            lastName: user?.lastName,
          );
    }
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Déconnexion'),
        content: const Text('Voulez-vous vous déconnecter ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Déconnecter', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      await ref.read(authProvider.notifier).logout();
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;

    return Scaffold(
      appBar: AppBar(title: const Text('Profil')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: AppColors.primaryLight,
                    child: Text(
                      user == null
                          ? '?'
                          : _initials(user.firstName, user.lastName),
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.fullName ?? 'Utilisateur',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          user?.email ?? '',
                          style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                        ),
                        const SizedBox(height: 6),
                        Chip(
                          visualDensity: VisualDensity.compact,
                          label: Text(
                            user == null ? 'Profil' : _roleLabel(user.role),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.notifications_outlined, color: AppColors.primary),
                  title: const Text('Notifications'),
                  subtitle: const Text('Rappels de rendez-vous et messages'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const NotificationsScreen()),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.phone_outlined, color: AppColors.primary),
                  title: const Text('Téléphone'),
                  subtitle: Text(
                    user?.phone != null && user!.phone!.isNotEmpty
                        ? user.phone!
                        : 'Non renseigné',
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.home_outlined, color: AppColors.primary),
                  title: const Text('Adresse'),
                  subtitle: Text(
                    user?.address != null && user!.address!.isNotEmpty
                        ? user.address!
                        : 'Non renseignée',
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.edit_outlined, color: AppColors.primary),
                  title: const Text('Modifier mes informations'),
                  onTap: () => _editInfo(context, ref),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: () => _confirmLogout(context, ref),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: Colors.white,
            ),
            icon: const Icon(Icons.logout),
            label: const Text('Se déconnecter'),
          ),
        ],
      ),
    );
  }
}