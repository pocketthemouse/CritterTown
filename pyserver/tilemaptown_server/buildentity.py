# Tilemap Town
# Copyright (C) 2017-2023 NovaSquirrel
#
# This program is free software: you can redistribute it and/or
# modify it under the terms of the GNU General Public License as
# published by the Free Software Foundation; either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

import asyncio, datetime, random, websockets, json, os.path, hashlib
from .buildglobal import *

entityCounter = 1

class Entity(object):
	def __init__(self, entity_type, creator_id=None):
		global entityCounter

		self.entity_type = entity_type

		self.name = '?'
		self.desc = None
		self.dir = 2 # South
		self.map = None

		self.pic = [0, 8, 24]

		self.map_id = None         # Map the entity is currently on
		self.x = 0
		self.y = 0

		self.home_id = None        # Map that is the entity's "home"
		self.home_position = None

		self.id = entityCounter  # temporary ID for referring to different objects in RAM
		self.db_id = None        # more persistent ID: the database key
		entityCounter += 1

		self.map_allow = 0       # Cache map allows and map denys to avoid excessive SQL queries
		self.map_deny = 0
		self.oper_override = False

		# other info
		self.tags = {}    # description, species, gender and other things
		self.data = None
		self.contents = set()

		# temporary information
		self.requests = {} # indexed by username, array with [timer, type]
		# valid types are "tpa", "tpahere", "carry"
		self.tp_history = []

		# allow cleaning up BotWatch info
		self.listening_maps = set() # tuples of (category, map)

		# riding information
		self.vehicle = None     # user being ridden
		self.passengers = set() # users being carried
		self.is_following = False # if true, follow behind instead of being carried

		# permissions
		self.creator_id = creator_id
		self.owner_id = creator_id
		self.allow = 0
		self.deny = 0
		self.guest_deny = 0

	def __del__(self):
		self.cleanup()
		AllEntities.pop(self.db_id, None)

	def cleanup(self):
		temp = set(self.passengers)
		for u in temp:
			u.dismount()
		if self.vehicle:
			self.dismount()

	def send(self, commandType, commandParams):
		# Not supported by default
		return

	def broadcast(self, commandType, commandParams, remote_category=None, remote_only=False):
		""" Send a message to everyone on the map """
		if not remote_only:
			for client in self.users:
				client.send(commandType, commandParams)

		""" Also send it to any registered listeners """
		if remote_category != None and self.id in BotWatch[remote_category]:
			commandParams['remote_map'] = self.id
			for client in BotWatch[remote_category][self.id]:
				if (client.map_id != self.id) or remote_only: # don't send twice to people on the map
					client.send(commandType, commandParams)

	# Permission checking

	def update_map_permissions(self):
		""" Update map_allow and map_deny for the current map """
		self.map_allow = 0
		self.map_deny = 0

		# If a guest, don't bother looking up any queries
		if self.db_id == None:
			return
		c = Database.cursor()
		c.execute('SELECT allow, deny FROM Map_Permission WHERE mid=? AND uid=?', (self.map_id, self.db_id,))
		result = c.fetchone()
		if result != None:
			self.map_allow = result[0]
			self.map_deny = result[1]

		# Turn on all permissions
		for row in c.execute('SELECT p.allow FROM Group_Map_Permission p, Group_Member m\
			WHERE m.uid=? AND p.gid=m.gid AND p.mid=?', (self.db_id, self.map_id)):
			self.map_allow |= row[0]

	def in_ban_list(self, banlist, action):
		if self.username == None and '!guests' in banlist:
			self.send("ERR", {'text': 'Guests may not %s' % action})
			return True
		if self.username in banlist:
			self.send("ERR", {'text': 'You may not %s' % action})
			return True
		return False

	def must_be_server_admin(self, give_error=True):
		return False

	def must_be_owner(self, admin_okay, give_error=True):
		if self.map.owner_id == self.db_id or self.oper_override or (admin_okay and self.map.has_permission(self, permission['admin'], False)):
			return True
		elif give_error:
			self.send("ERR", {'text': 'You don\'t have permission to do that'})
		return False

	def set_permission(self, uid, perm, value):
		if uid == None:
			return
		# Start blank
		allow = 0
		deny = 0

		# Get current value
		c = Database.cursor()
		c.execute('SELECT allow, deny FROM Map_Permission WHERE mid=? AND uid=?', (self.id, uid,))
		result = c.fetchone()
		if result != None:
			allow = result[0]
			deny = result[1]

		# Alter the permissions
		if value == True:
			allow |= perm
			deny &= ~perm
		elif value == False:
			allow &= ~perm
			deny |= perm
		elif value == None:
			allow &= ~perm
			deny &= ~perm

		# Delete if permissions were removed
		if not (allow | deny):
			c.execute('DELETE FROM Map_Permission WHERE mid=? AND uid=?', (self.id, uid,))
			return

		# Update or insert depending on needs
		if result != None:
			c.execute('UPDATE Map_Permission SET allow=?, deny=? WHERE mid=? AND uid=?', (allow, deny, self.id, uid,))
		else:
			c.execute("INSERT INTO Map_Permission (mid, uid, allow, deny) VALUES (?, ?, ?, ?)", (self.id, uid, allow, deny,))

	def set_group_permission(self, gid, perm, value):
		if gid == None:
			return
		# Start blank
		allow = 0

		# Get current value
		c = Database.cursor()
		c.execute('SELECT allow FROM Group_Map_Permission WHERE mid=? AND gid=?', (self.id, gid,))
		result = c.fetchone()
		if result != None:
			allow = result[0]

		# Alter the permissions
		if value == True:
			allow |= perm
		elif value == None:
			allow &= ~perm

		# Delete if permissions were removed
		if not allow:
			c.execute('DELETE FROM Group_Map_Permission WHERE mid=? AND gid=?', (self.id, gid,))
			return

		# Update or insert depending on needs
		if result != None:
			c.execute('UPDATE Group_Map_Permission SET allow=? WHERE mid=? AND gid=?', (allow, self.id, gid,))
		else:
			c.execute("INSERT INTO Group_Map_Permission (mid, gid, allow) VALUES (?, ?, ?)", (self.id, gid, allow,))

	def has_permission(self, user, perm, default):
		# Oper override bypasses permission checks
		if user.oper_override:
			return True
		# As does being the owner of the map
		if user.db_id != None and self.owner == user.db_id:
			return True

		# Start with the server default
		has = default
		# and let the map override that default
		if self.allow & perm:
			has = True
		if self.deny & perm:
			has = False

		# If guest, apply guest_deny
		if user.db_id == None:
			if self.guest_deny & perm:
				has = False
			return has

		# If user is on the map, use the cached value
		if user.map_id == self.id:
			if user.map_deny & perm:
				return False
			if user.map_allow & perm:
				return True
		else:
			# Search Map_Permission table
			c = Database.cursor()
			c.execute('SELECT allow, deny FROM Map_Permission WHERE mid=? AND uid=?', (self.id, user.db_id,))
			result = c.fetchone()
			# If they have a per-user override, use that
			if result != None:
				# Override the defaults
				if result[1] & perm:
					return False
				if result[0] & perm:
					return True

		# Is there any group the user is a member of, where the map has granted the permission?
		c = Database.cursor()
		c.execute('SELECT EXISTS(SELECT p.allow FROM Group_Map_Permission p, Group_Member m WHERE\
			m.uid=? AND\
			p.gid=m.gid AND\
			p.mid=? AND\
			(p.allow & ?)\
			!=0)', (user.db_id, self.id, perm))
		if c.fetchone()[0]:
			return True

		# Search for groups
		return has

	# Riding

	def ride(self, other):
		# cannot ride yourself
		if self == other:
			return
		# remove the old ride before getting a new one
		if self.vehicle != None:
			self.dismount()
		# let's not deal with trees of passengers first
		if len(self.passengers):
			self.send("MSG", {'text': 'You let out all your passengers first'})
			temp = set(self.passengers)
			for u in temp:
				u.dismount()

		self.send("MSG", {'text': 'You get on %s (/hopoff to get off)' % other.nameAndUsername()})
		other.send("MSG", {'text': 'You carry %s' % self.nameAndUsername()})

		self.vehicle = other
		other.passengers.add(self)

		self.map.broadcast("WHO", {'add': self.who()}, remote_category=botwatch_type['move'])
		other.map.broadcast("WHO", {'add': other.who()}, remote_category=botwatch_type['move'])

		self.switch_map(other.map_id, new_pos=[other.x, other.y])

	def dismount(self):
		if self.vehicle == None:
			self.send("ERR", {'text': 'You\'re not being carried'})
		else:
			self.send("MSG", {'text': 'You get off %s' % self.vehicle.nameAndUsername()})
			self.vehicle.send("MSG", {'text': '%s gets off of you' % self.nameAndUsername()})

			other = self.vehicle

			self.vehicle.passengers.remove(self)
			self.vehicle = None

			self.map.broadcast("WHO", {'add': self.who()}, remote_category=botwatch_type['move'])
			other.map.broadcast("WHO", {'add': other.who()}, remote_category=botwatch_type['move'])

	# Apply information from a MOV message to someone

	def move_to(self, x, y, new_dir=None, is_teleport=False):
		old_dir = self.dir

		if new_dir != None:
			self.dir = new_dir
		if x != None: # Assume y is good too
			# Save the old position because following moves to the old position, not the new one
			old_x = self.x
			old_y = self.y

			# Set the new position, and update any passengers
			self.x = x
			self.y = y
			for u in self.passengers:
				if u.is_following and not isTeleport: # If "from" isn't present, it's a teleport, not normal movement
					u.moveTo(old_y, old_x, old_dir if new_dir != None else None)
				else:
					u.moveTo(x, y, newDir)
				u.map.broadcast("MOV", {'id': u.id, 'to': [u.x, u.y], 'dir': u.dir}, remote_category=botwatch_type['move'])

	# Other movement

	def switch_map(self, map_id, new_pos=None, goto_spawn=True, update_history=True):
		""" Teleport the user to another map """
		if update_history and self.map_id >= 0:
			# Add a new teleport history entry if new map
			if self.map_id != map_id:
				self.tp_history.append([self.map_id, self.x, self.y])
			if len(self.tp_history) > 20: # Only keep 20 most recent entries
				self.tp_history.pop(0)

		if self.map_id != map_id:
			# First check if you can even go to that map
			map_load = get_entity_by_id(map_id)
			if map_load == None:
				self.send("ERR", {'text': 'Couldn\'t load map %d' % map_id})
				return False
			if not map_load.has_permission(self, permission['entry'], True):
				self.send("ERR", {'text': 'You don\'t have permission to go to map %d' % map_id})
				return False

			if self.map:
				# Remove the user for everyone on the map
				self.map.contents.remove(self)
				self.map.broadcast("WHO", {'remove': self.id}, remote_category=botwatch_type['entry'])

			# Get the new map and send it to the client
			self.map_id = map_id
			self.map = map_load
			self.update_map_permissions()

			self.map.contents.add(self)
			if isinstance(self.map, Map):
				self.send("MAI", self.map.map_info())
				self.send("MAP", self.map.map_section(0, 0, self.map.width-1, self.map.height-1))
			self.send("WHO", {'list': self.map.who_contents(), 'you': self.id})

			# Tell everyone on the new map the user arrived
			self.map.broadcast("WHO", {'add': self.who()}, remote_category=botwatch_type['entry'])

			# Warn about chat listeners, if present
			if map_id in BotWatch[botwatch_type['chat']]:
				self.send("MSG", {'text': 'A bot has access to messages sent here ([command]listeners[/command])'})

		# Move player's X and Y coordinates if needed
		if new_pos != None:
			self.move_to(new_pos[0], new_pos[1], is_teleport=True)
			self.map.broadcast("MOV", {'id': self.id, 'to': [self.x, self.y]}, remote_category=botwatch_type['move'])
		elif goto_spawn:
			self.move_to(self.map.start_pos[0], self.map.start_pos[1], is_teleport=True)
			self.map.broadcast("MOV", {'id': self.id, 'to': [self.x, self.y]}, remote_category=botwatch_type['move'])

		# Move any passengers too
		for u in self.passengers:
			u.switch_map(map_id, new_pos=[self.x, self.y])
		return True

	def send_home(self):
		""" If player has a home, send them there. If not, to map zero """
		if self.home != None:
			self.switch_map(self.home[0], new_pos=[self.home[1], self.home[2]])
		else:
			self.switch_map(0)

	# Information

	def who(self):
		""" A dictionary of information for the WHO command """
		return {
			'name': self.name,
			'pic': self.pic,
			'x': self.x,
			'y': self.y,
			'dir': self.dir,
			'id': self.id,
			'passengers': [passenger.id for passenger in self.passengers],
			'vehicle': self.vehicle.id if self.vehicle else None,
			'is_following': self.is_following
		}

	def who_contents(self):
		""" WHO message data """
		return {str(e.id):e.who() for e in e.contents}

	def username_or_id(self):
		return str(self.id)

	def name_and_username(self):
		return '%s (%s)' % (self.name, self.username_or_id())

	def set_tag(self, name, value):
		self.tags[name] = value

	def get_tag(self, name, default=None):
		if name in self.tags:
			return self.tags[name]
		return default

	# Database access

	def load(self, id):
		""" Load an account from the database """
		self.db_id = id

		c = Database.cursor()
		c.execute('SELECT type, name, desc, pic, location, position, home_location, home_position, tags, owner_id, allow, deny, guest_deny, data, creator_id FROM Entity WHERE id=?', (self.db_id,))
		result = c.fetchone()
		if result == None:
			return False

		self.entity_type = result[0]
		self.name = result[1]
		self.desc = result[2]
		self.pic = loads_if_not_none(result[3])
		self.map_id = result[4]
		position = loads_if_not_none(result[5])
		if position != None:
			self.x = position[0]
			self.y = position[1]
			if len(position) == 3:
				self.dir = position[2]
		self.home_id = result[6]
		self.home_position = loads_if_not_none(result[7])
		self.tags = loads_if_not_none(result[8])
		self.owner_id = result[9]
		self.allow = result[10]
		self.deny = result[11]
		self.guest_deny = result[12]
		self.data = loads_if_not_none(result[13])
		self.creator_id = result[14]
		return True

	def save(self):
		""" Save entity information to the database """
		c = Database.cursor()

		if self.db_id == None:
			c.execute("INSERT INTO Entity (created_at, creator_id) VALUES (?, ?)", (datetime.datetime.now(), self.creator_id))
			self.db_id = c.lastrowid
			if self.db_id == None:
				return

		values = (self.entity_type, self.name, self.desc, json.dumps(self.pic), self.map_id, [self.x, self.y] + ([self.dir] if self.dir != 2 else []), self.home_id, dumps_if_not_none(self.home_position), dumps_if_condition(self.tags, self.tags != {}), self.owner_id, self.allow, self.deny, self.guest_deny, dumps_if_not_none(self.data), self.db_id)
		c.execute("UPDATE Entity SET type=?, name=?, desc=?, pic=?, location=?, position=?, home_location=?, home_position=?, tags=?, owner_id=?, allow=?, deny=?, guest_deny=?, data=? WHERE id=?", values)

	def save_and_commit(self):
		self.save()
		Database.commit()

	def receive_command(self, client, command, arg):
		""" Add a command from the client to a queue, or just execute it """
		self.execute_command(client, command, arg)

	def execute_command(self, client, command, arg):
		""" Actually run a command from the client after being processed """
		client.idle_timer = 0
		handle_protocol_command(self, client, command, arg)
