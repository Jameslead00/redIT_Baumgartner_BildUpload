import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import Avatar from "@mui/material/Avatar";
import PersonIcon from '@mui/icons-material/Person';
import WorkIcon  from "@mui/icons-material/Work";
import MailIcon from '@mui/icons-material/Mail';
import PhoneIcon from '@mui/icons-material/Phone';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { useTranslation } from "react-i18next";

export type GraphData = {
    displayName: string,
    jobTitle: string,
    mail: string,
    businessPhones: string[],
    officeLocation: string
};

export const ProfileData: React.FC<{graphData: GraphData}> = ({graphData}) => {
    const { t } = useTranslation();
    return (
        <List className="profileData">
            <NameListItem name={graphData.displayName} label={t('profile.name')} />
            <JobTitleListItem jobTitle={graphData.jobTitle} label={t('profile.title')} />
            <MailListItem mail={graphData.mail} label={t('profile.mail')} />
            <PhoneListItem phone={graphData.businessPhones[0]} label={t('profile.phone')} />
            <LocationListItem location={graphData.officeLocation} label={t('profile.location')} />
        </List>
    );
};

const NameListItem: React.FC<{name: string; label: string}> = ({name, label}) => (
    <ListItem>
        <ListItemAvatar>
            <Avatar>
                <PersonIcon />
            </Avatar>
        </ListItemAvatar>
        <ListItemText primary={label} secondary={name}/>
    </ListItem>
);

const JobTitleListItem: React.FC<{jobTitle: string; label: string}> = ({jobTitle, label}) => (
    <ListItem>
        <ListItemAvatar>
            <Avatar>
                <WorkIcon />
            </Avatar>
        </ListItemAvatar>
        <ListItemText primary={label} secondary={jobTitle}/>
    </ListItem>
);

const MailListItem: React.FC<{mail: string; label: string}> = ({mail, label}) => (
    <ListItem>
        <ListItemAvatar>
            <Avatar>
                <MailIcon />
            </Avatar>
        </ListItemAvatar>
        <ListItemText primary={label} secondary={mail}/>
    </ListItem>
);

const PhoneListItem: React.FC<{phone: string; label: string}> = ({phone, label}) => (
    <ListItem>
        <ListItemAvatar>
            <Avatar>
                <PhoneIcon />
            </Avatar>
        </ListItemAvatar>
        <ListItemText primary={label} secondary={phone}/>
    </ListItem>
);

const LocationListItem: React.FC<{location: string; label: string}> = ({location, label}) => (
    <ListItem>
        <ListItemAvatar>
            <Avatar>
                <LocationOnIcon />
            </Avatar>
        </ListItemAvatar>
        <ListItemText primary={label} secondary={location}/>
    </ListItem>
);